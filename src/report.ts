import { InputRecord, ResultRecord } from './store';
import { SolveResult, VerifyResult } from './types';

/** 生成 Markdown 报告；内容只引用冻结在结果与输入版本中的数据。 */
export function renderReport(input: InputRecord, result: ResultRecord): string {
  const lines: string[] = [];
  lines.push(`# 覆盖方案选择报告 #${result.id}`);
  lines.push('');
  lines.push(`- 输入版本: #${input.id} (${input.name})`);
  lines.push(`- 输入哈希: ${input.hash.slice(0, 16)}...`);
  lines.push(`- 算法: ${result.algo}`);
  lines.push(`- 生成时间: ${result.createdAt}`);
  lines.push('');
  lines.push(`## 冻结输入快照`);
  lines.push(`- 全集 (${input.universe.length}): ${input.universe.join(', ') || '(空)'}`);
  lines.push(`- 候选方案 (${input.candidates.length}):`);
  for (const c of input.candidates) {
    lines.push(`  - ${c.id}: 成本 ${c.cost}, 覆盖 [${c.elements.join(', ')}]`);
  }
  if (input.dedupNotes.length > 0) {
    lines.push(`- 清单去重说明:`);
    for (const d of input.dedupNotes) {
      lines.push(`  - ${d.id}: 移除重复元素 [${d.removed.join(', ')}]`);
    }
  }
  lines.push('');
  const p = result.payload as any;
  if (result.kind === 'verify') {
    const v = p as VerifyResult;
    lines.push(`## 核验结果: ${v.status === 'complete' ? '完整覆盖' : '未完整覆盖'}`);
    lines.push(`- 方案集合: ${v.planIds.join(', ') || '(空)'}`);
    if (v.duplicateIds.length > 0) {
      lines.push(`- 重复提交(未重复计费): ${v.duplicateIds.join(', ')}`);
    }
    lines.push(`- 总成本: ${v.totalCost}`);
    lines.push(`- 未覆盖: ${v.uncovered.join(', ') || '(无)'}`);
  } else {
    const s = p as SolveResult;
    lines.push(`## 求解结果: ${s.status === 'complete' ? '完整覆盖' : '无法完整覆盖'}`);
    lines.push(`- 选中方案: ${s.selectedIds.join(', ') || '(空)'}`);
    lines.push(`- 总成本: ${s.totalCost}`);
    lines.push(`- 未覆盖: ${s.uncovered.join(', ') || '(无)'}`);
    if (s.note) lines.push(`- 说明: ${s.note}`);
    if (s.steps.length > 0) {
      lines.push('');
      lines.push('## 逐步选择过程');
      for (const st of s.steps) {
        lines.push(`### 第 ${st.round} 轮: 选择 ${st.chosenId} (成本 ${st.chosenCost})`);
        lines.push(`- 本轮候选比值 (成本/新增覆盖数):`);
        for (const r of st.ratios) {
          lines.push(`  - ${r.id}: ${r.cost}/${r.newCount}`);
        }
        lines.push(`- 新增覆盖: ${st.newlyCovered.join(', ')}`);
        lines.push(`- 累计成本: ${st.cumulativeCost}, 剩余未覆盖: ${st.remainingUncovered}`);
      }
    }
  }
  lines.push('');
  lines.push('> 贪心算法给出的是可解释的可行解，不保证全局成本最低。');
  return lines.join('\n');
}
