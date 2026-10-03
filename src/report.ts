import type { GreedyResult } from "./types.js";

/** 将一次贪心运行结果导出为 Markdown 报告。 */
export function greedyReportMarkdown(run: {
  runId: number;
  versionId: number;
  createdAt: string;
  result: GreedyResult;
}): string {
  const r = run.result;
  const lines: string[] = [];
  lines.push(`# 覆盖方案选择报告 #${run.runId}`);
  lines.push("");
  lines.push(`- 输入版本: ${run.versionId}`);
  lines.push(`- 算法版本: ${r.algoVersion}`);
  lines.push(`- 生成时间: ${run.createdAt}`);
  lines.push(`- 状态: ${r.status === "complete" ? "完整覆盖" : "无法完整覆盖"}`);
  lines.push(`- 总成本: ${r.totalCost}`);
  lines.push(`- 说明: 贪心启发式给出可解释的可行解，不保证全局最优成本。`);
  lines.push("");
  lines.push("## 选择过程");
  lines.push("");
  for (const s of r.steps) {
    lines.push(`### 第 ${s.round} 轮：选择 ${s.chosenId}（成本 ${s.chosenCost}）`);
    lines.push("");
    lines.push(`- 新增覆盖: ${s.newElements.join(", ")}`);
    lines.push(`- 本轮后剩余未覆盖数: ${s.remainingAfter}`);
    lines.push(`- 候选比值（成本/新增覆盖，按胜出规则排序）:`);
    for (const c of s.ratios) {
      lines.push(`  - ${c.id}: ${c.ratio}（新增 ${c.newCoverage}）`);
    }
    lines.push("");
  }
  lines.push("## 结论");
  lines.push("");
  lines.push(`- 选中方案: ${r.selectedIds.length ? r.selectedIds.join(", ") : "（空）"}`);
  lines.push(`- 未覆盖元素: ${r.uncovered.length ? r.uncovered.join(", ") : "无"}`);
  lines.push(`- ${r.message}`);
  lines.push("");
  return lines.join("\n");
}
