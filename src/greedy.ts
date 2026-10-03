import { Candidate, Problem, SolveResult, Step } from './types';

export const GREEDY_ALGO_VERSION = 'greedy-v1';

/**
 * 确定性加权集合覆盖贪心。
 * 每轮在仍有新增覆盖的候选中，用整数交叉相乘比较 cost/newCount：
 *   a 优于 b 当且仅当 a.cost * b.newCount < b.cost * a.newCount
 * 比值相同先比成本(小者优先)，再按方案编号字典序(固定次序)。
 * 不使用浮点舍入，不做一次性排序。
 */
export function greedySolve(problem: Problem): SolveResult {
  const { universe, candidates } = problem;
  if (universe.length === 0) {
    return {
      algo: GREEDY_ALGO_VERSION,
      status: 'complete',
      selectedIds: [],
      totalCost: '0',
      uncovered: [],
      steps: [],
      note: '全集为空，零成本空方案即完整覆盖',
    };
  }
  const uncovered = new Set(universe);
  const chosen = new Set<string>();
  const steps: Step[] = [];
  let cumulative = 0n;

  while (uncovered.size > 0) {
    // 每轮重新计算各未选候选的新增覆盖数量
    const alive: { c: Candidate; newly: string[] }[] = [];
    for (const c of candidates) {
      if (chosen.has(c.id)) continue;
      const newly = c.elements.filter((e) => uncovered.has(e));
      if (newly.length > 0) alive.push({ c, newly });
    }
    if (alive.length === 0) {
      return {
        algo: GREEDY_ALGO_VERSION,
        status: 'infeasible',
        selectedIds: [...chosen].sort(),
        totalCost: cumulative.toString(),
        uncovered: [...uncovered].sort(),
        steps,
        note: '仍有未覆盖元素，但所有剩余候选都无新增覆盖，无法完整覆盖',
      };
    }
    let best = alive[0];
    for (let i = 1; i < alive.length; i++) {
      if (compare(alive[i], best) < 0) best = alive[i];
    }
    for (const e of best.newly) uncovered.delete(e);
    chosen.add(best.c.id);
    cumulative += best.c.cost;
    steps.push({
      round: steps.length + 1,
      chosenId: best.c.id,
      chosenCost: best.c.cost.toString(),
      newlyCovered: [...best.newly].sort(),
      ratios: alive
        .map((a) => ({ id: a.c.id, cost: a.c.cost.toString(), newCount: a.newly.length }))
        .sort((x, y) => (x.id < y.id ? -1 : 1)),
      cumulativeCost: cumulative.toString(),
      remainingUncovered: uncovered.size,
    });
  }
  return {
    algo: GREEDY_ALGO_VERSION,
    status: 'complete',
    selectedIds: [...chosen].sort(),
    totalCost: cumulative.toString(),
    uncovered: [],
    steps,
  };
}

function compare(
  a: { c: Candidate; newly: string[] },
  b: { c: Candidate; newly: string[] },
): number {
  const left = a.c.cost * BigInt(b.newly.length);
  const right = b.c.cost * BigInt(a.newly.length);
  if (left !== right) return left < right ? -1 : 1;
  if (a.c.cost !== b.c.cost) return a.c.cost < b.c.cost ? -1 : 1;
  return a.c.id < b.c.id ? -1 : a.c.id > b.c.id ? 1 : 0;
}
