import { tool } from "ai";
import { z } from "zod";

export const taskCompleteTool = tool({
  description: `标记任务已完成。

**仅在以下全部条件满足时才能调用：**
1. planTask 制定的所有步骤均已执行完毕
2. 已收集到足够的信息来达成用户目标
3. 即将输出完整、高质量的最终结果

调用此工具后，输出完整的最终答案。`,

  inputSchema: z.object({
    success: z.boolean().describe("是否成功完成所有目标"),
    completedSteps: z.array(z.string()).min(1).describe("已完成的步骤描述列表"),
    summary: z.string().min(1).describe("任务完成情况的简要总结（将附在最终结果前）"),
  }),

  execute: async ({ success, completedSteps, summary }) => {
    return {
      done: true,
      success,
      completedSteps,
      summary,
      message: success
        ? `所有 ${completedSteps.length} 个步骤已完成，请输出最终结果。`
        : `任务部分完成（${completedSteps.length} 步），请说明未完成的原因并给出当前最佳结果。`,
    };
  },
});
