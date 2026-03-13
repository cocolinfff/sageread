import { tool } from "ai";
import { z } from "zod";

export const planTaskTool = tool({
  description: `**[Agent模式第一步，系统强制调用]** 将用户目标拆解为可执行的步骤计划。

必须在执行任何其他操作之前调用此工具，输出完整的任务计划。`,

  inputSchema: z.object({
    goal: z.string().min(1).describe("用户目标的简洁描述（1-2句话）"),
    steps: z
      .array(
        z.object({
          id: z.number().int().min(1).describe("步骤编号"),
          action: z.string().min(1).describe("步骤的具体操作描述"),
          tools: z.array(z.string()).optional().describe("预计使用的工具名称"),
        }),
      )
      .min(1)
      .describe("完成目标的步骤列表，按执行顺序排列"),
    approach: z.string().min(1).describe("解决问题的整体思路和策略"),
  }),

  execute: async ({ goal, steps, approach }) => {
    return {
      success: true,
      plan: { goal, steps, approach },
      totalSteps: steps.length,
      message: `计划制定完成，共 ${steps.length} 个步骤，即将开始执行。请按步骤顺序推进，完成所有步骤后调用 taskComplete。`,
    };
  },
});
