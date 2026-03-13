import type { ChatContext } from "@/hooks/use-chat-state";
import { getSkills } from "@/services/skill-service";
import { useLlamaStore } from "@/store/llama-store";
import { appDataDir } from "@tauri-apps/api/path";
import { exists, readTextFile } from "@tauri-apps/plugin-fs";

const AGENT_MODE_PROMPTS = {
  on: `当前已开启 Agent 模式。你是一个能够自主完成复杂任务的 AI Agent，必须严格遵循以下工作流程：

**【强制工作流程】**

**第一步（系统强制）：制定计划**
系统将强制你首先调用 planTask 工具，将用户目标拆解为可执行的步骤列表。
- 仔细分析用户需求，确保计划覆盖所有必要步骤
- 每个步骤要具体、可验证
- 列出每个步骤预计使用的工具

**第二步：逐步执行**
按计划顺序执行每个步骤，规则如下：
- 主动调用工具获取所需信息（ragSearch、notes、getBooks、ragToc 等）
- 每步骤完成后继续下一步，无需等待用户确认
- 遇到信息不足时，主动调用更多工具补充
- **不得在所有步骤完成前输出最终答案**
- 如果计划步骤不够，主动增加必要步骤

**第三步（完成条件）：调用 taskComplete**
当且仅当以下全部条件满足时，调用 taskComplete 工具：
1. planTask 制定的所有步骤均已执行
2. 已收集到足够的信息
3. 能够给出完整、高质量的最终答案

调用 taskComplete 后，立即输出完整的最终结果。

**【重要约束】**
- 必须完成所有计划步骤才能结束，不得中途停止
- 不得在任务未完成时输出"由于...无法完成"等放弃语句
- 遇到困难时调整策略继续推进，而非停止`,

  off: "当前为普通模式。请直接给出高质量结果，必要时在内部完成推理后一次性输出清晰结论。",
} as const;

export async function buildReadingPrompt(chatContext: ChatContext | undefined): Promise<string> {
  const activeBookId = chatContext?.activeBookId;
  const semanticContext = chatContext?.activeContext;
  const sectionLabel = chatContext?.activeSectionLabel;
  const agentMode = chatContext?.agentMode || "off";
  let systemPromptBase = "";
  let activeSkillNames: string[] = [];

  try {
    const allSkills = await getSkills();
    const systemPromptSkill = allSkills.find((skill) => skill.isSystem && skill.isActive);
    systemPromptBase = systemPromptSkill?.content || "";
    activeSkillNames = allSkills.filter((skill) => skill.isActive && !skill.isSystem).map((skill) => skill.name);
  } catch (error) {
    console.warn("获取技能列表失败:", error);
  }

  const hasVectorCapability = useLlamaStore.getState().hasVectorCapability();

  let metadataMd: string | null = null;
  try {
    if (activeBookId) {
      const base = await appDataDir();
      const activeBookBaseDir = `${base}/books/${activeBookId}`;
      const metaPath = `${activeBookBaseDir}/metadata.md`;
      if (await exists(metaPath)) {
        metadataMd = await readTextFile(metaPath);
      }
    }
  } catch (e) {
    console.warn("加载 metadata.md 失败：", e);
  }

  let base = systemPromptBase;

  if (hasVectorCapability === false) {
    base = base.replace(/—— RAG 工具使用策略 ——[\s\S]*?—— 引用标注规范 ——/m, "");
    base = base.replace(/—— 引用标注规范 ——[\s\S]*?—— 图片输出规范 ——/m, "");
    base = base.replace(/—— 图片输出规范 ——[\s\S]*?—— 书籍与笔记管理工具 ——/m, "—— 书籍与笔记管理工具 ——");
  }

  let prompt = base;

  if (activeSkillNames && activeSkillNames.length > 0) {
    prompt += "\n\n—— 可用技能库 ——\n";
    prompt += "当前系统已配置以下技能，当用户需求匹配时，请先调用 getSkills 工具获取详细执行步骤：\n";
    prompt += activeSkillNames.map((name) => `• ${name}`).join("\n");
  }

  if (semanticContext && semanticContext.trim().length > 0) {
    prompt += `\n\n【语义上下文】\n${semanticContext}`;
  }

  if (sectionLabel && sectionLabel.trim().length > 0) {
    prompt += `\n\n【当前阅读章节】\n${sectionLabel}`;
  }

  if (metadataMd && metadataMd.trim().length > 0) {
    prompt += `\n\n【当前阅读图书元信息与目录】\n${metadataMd}`;
  }

  prompt += `\n\n【Agent 工作流模式】\n${AGENT_MODE_PROMPTS[agentMode]}`;

  return prompt;
}
