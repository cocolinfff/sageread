import { buildReadingPrompt } from "@/constants/prompt";
import type { ChatContext } from "@/hooks/use-chat-state";
import { useLlamaStore } from "@/store/llama-store";
import type { UIMessage } from "@ai-sdk/react";
import {
  type ChatRequestOptions,
  type ChatTransport,
  type LanguageModel,
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

function extractReasoningContent(message: UIMessage): string | undefined {
  if (message.role !== "assistant" || !Array.isArray(message.parts)) {
    return undefined;
  }

  const reasoningContent = message.parts
    .filter((part): part is { type: "reasoning"; text: string } => {
      return part?.type === "reasoning" && typeof (part as any).text === "string";
    })
    .map((part) => part.text)
    .join("")
    .trim();

  return reasoningContent || undefined;
}

function attachDeepSeekReasoningContent(
  uiMessages: UIMessage[],
  modelMessages: any[],
  model: LanguageModel,
): any[] {
  const provider = (model as { provider?: string }).provider;
  if (typeof provider !== "string" || !provider.startsWith("deepseek.")) {
    return modelMessages;
  }

  const patchedMessages = [...modelMessages];
  let assistantMessageCursor = 0;

  for (const uiMessage of uiMessages) {
    if (uiMessage.role !== "assistant") {
      continue;
    }

    const reasoningContent = extractReasoningContent(uiMessage);
    if (!reasoningContent) {
      continue;
    }

    while (assistantMessageCursor < patchedMessages.length && patchedMessages[assistantMessageCursor]?.role !== "assistant") {
      assistantMessageCursor++;
    }

    if (assistantMessageCursor >= patchedMessages.length) {
      break;
    }

    const assistantMessage = patchedMessages[assistantMessageCursor];
    patchedMessages[assistantMessageCursor] = {
      ...assistantMessage,
      providerOptions: {
        ...(assistantMessage.providerOptions || {}),
        openaiCompatible: {
          ...(assistantMessage.providerOptions?.openaiCompatible || {}),
          reasoning_content:
            assistantMessage.providerOptions?.openaiCompatible?.reasoning_content ?? reasoningContent,
        },
      },
    };
    assistantMessageCursor++;
  }

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
      stopWhen: stepCountIs(20),
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
