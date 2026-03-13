import { buildReadingPrompt } from "@/constants/prompt";
import type { ChatContext } from "@/hooks/use-chat-state";
import { useLlamaStore } from "@/store/llama-store";
import type { UIMessage } from "@ai-sdk/react";
import {
  type ChatRequestOptions,
  type ChatTransport,
  type LanguageModel,
  type ModelMessage,
  type PrepareSendMessagesRequest,
  type UIMessageChunk,
  convertToModelMessages,
  stepCountIs,
  streamText,
} from "ai";
import {
  createRagContextTool,
  createRagSearchTool,
  createRagTocTool,
  getBooksTool,
  getReadingStatsTool,
  getSkillsTool,
  mindmapTool,
  notesTool,
} from "./tools";
import { processQuoteMessages, selectValidMessages } from "./utils";

interface ReasoningPart {
  type: "reasoning";
  text: string;
}

function isReasoningPart(part: unknown): part is ReasoningPart {
  return (
    typeof part === "object" &&
    part !== null &&
    "type" in part &&
    "text" in part &&
    (part as { type?: unknown }).type === "reasoning" &&
    typeof (part as { text?: unknown }).text === "string"
  );
}

function extractReasoningContent(message: UIMessage): string | undefined {
  if (message.role !== "assistant" || !Array.isArray(message.parts)) {
    return undefined;
  }

  const reasoningContent = message.parts
    .filter(isReasoningPart)
    .map((part) => part.text)
    .join("")
    .trim();

  return reasoningContent || undefined;
}

function attachDeepSeekReasoningContent(
  uiMessages: UIMessage[],
  modelMessages: ModelMessage[],
  model: LanguageModel,
): ModelMessage[] {
  const provider = (model as { provider?: string }).provider;
  // Check for any DeepSeek provider (deepseek, deepseek-reasoner, etc.)
  if (typeof provider !== "string" || !provider.includes("deepseek")) {
    return modelMessages;
  }

  // Build a map of reasoning content from UI messages by message ID
  const reasoningById = new Map<string, string>();
  for (const msg of uiMessages) {
    if (msg.role === "assistant" && msg.id) {
      const reasoning = extractReasoningContent(msg);
      if (reasoning) {
        reasoningById.set(msg.id, reasoning);
      }
    }
  }

  // Patch all assistant messages in modelMessages
  const patchedMessages = modelMessages.map((msg) => {
    if (msg.role !== "assistant") {
      return msg;
    }

    // Try to find reasoning content by message ID
    let reasoningContent: string | undefined;
    if (msg.experimental?.messageId) {
      reasoningContent = reasoningById.get(msg.experimental.messageId);
    }

    // If not found by ID, try to use existing reasoning_content
    if (!reasoningContent) {
      reasoningContent = msg.providerOptions?.openaiCompatible?.reasoning_content;
    }

    // DeepSeek API requires reasoning_content field for all assistant messages when using reasoning models
    return {
      ...msg,
      providerOptions: {
        ...(msg.providerOptions || {}),
        openaiCompatible: {
          ...(msg.providerOptions?.openaiCompatible || {}),
          reasoning_content: reasoningContent ?? "",
        },
      },
    };
  });

  return patchedMessages;
}

export class CustomChatTransport implements ChatTransport<UIMessage> {
  private model: LanguageModel;
  private prepareSendMessagesRequest?: PrepareSendMessagesRequest<UIMessage>;

  constructor(
    model: LanguageModel,
    options?: {
      prepareSendMessagesRequest?: PrepareSendMessagesRequest<UIMessage>;
    },
  ) {
    this.model = model;
    this.prepareSendMessagesRequest = options?.prepareSendMessagesRequest;
  }

  updateModel(model: LanguageModel) {
    this.model = model;
  }

  async sendMessages(
    options: {
      chatId: string;
      messages: UIMessage[];
      abortSignal: AbortSignal | undefined;
    } & {
      trigger: "submit-message" | "regenerate-message";
      messageId: string | undefined;
    } & ChatRequestOptions,
  ): Promise<ReadableStream<UIMessageChunk>> {
    let requestBody = options.body;

    if (this.prepareSendMessagesRequest) {
      const prepared = await this.prepareSendMessagesRequest({
        id: options.chatId,
        messages: options.messages,
        requestMetadata: options.metadata,
        body: options.body as Record<string, any> | undefined,
        credentials: undefined,
        headers: options.headers,
        api: "",
        trigger: options.trigger,
        messageId: options.messageId,
      });

      requestBody = prepared.body;
    }

    const chatContext = (requestBody as any)?.chatContext as ChatContext | undefined;
    const activeBookId = chatContext?.activeBookId;
    const maxStepCount = chatContext?.agentMode === "todo" ? 40 : 20;

    const processedMessages = processQuoteMessages(options.messages);
    const selectedMessages = selectValidMessages(processedMessages, 8);

    const hasVectorCapability = useLlamaStore.getState().hasVectorCapability();

    const tools: any = {
      notes: notesTool,
      getBooks: getBooksTool,
      getReadingStats: getReadingStatsTool,
      getSkills: getSkillsTool,
      mindmap: mindmapTool,
    };

    if (hasVectorCapability && activeBookId) {
      tools.ragSearch = createRagSearchTool(activeBookId);
      tools.ragToc = createRagTocTool(activeBookId);
      tools.ragContext = createRagContextTool(activeBookId);
    }

    const convertedMessages = convertToModelMessages(selectedMessages, {
      tools,
      ignoreIncompleteToolCalls: true,
    });
    const patchedMessages = attachDeepSeekReasoningContent(selectedMessages, convertedMessages, this.model);

    const result = streamText({
      model: this.model,
      messages: patchedMessages,
      abortSignal: options.abortSignal,
      toolChoice: "auto",
      stopWhen: stepCountIs(maxStepCount),
      tools,
      system: await buildReadingPrompt(chatContext),
    });

    return result.toUIMessageStream({
      onError: (error) => {
        console.log("error", error);
        if (error == null) {
          return "Unknown error";
        }
        if (typeof error === "string") {
          return error;
        }
        if (error instanceof Error) {
          return error.message;
        }
        return JSON.stringify(error);
      },
      messageMetadata: ({ part }) => {
        if (part.type === "finish") {
          return {
            totalUsage: part.totalUsage,
          };
        }
      },
    });
  }

  async reconnectToStream(
    _options: {
      chatId: string;
    } & ChatRequestOptions,
  ): Promise<ReadableStream<UIMessageChunk> | null> {
    return null;
  }
}
