import type { Candidate, GreedyResult, GreedyStep, Problem, RoundCandidateRatio } from "./types.js";
import { ALGO_VERSION, sortedElements } from "./validate.js";

interface Scored {
  candidate: Candidate;
  gain: number;
  newElements: string[];
}

/**
 * 比较 a 与 b 的 "成本/新增覆盖" 比值。
 * 用整数交叉相乘：a.cost/a.gain ? b.cost/b.gain  <=>  a.cost*b.gain ? b.cost*a.gain，
 * 全程 BigInt，不做任何小数舍入。
 * 返回值 <0 表示 a 更优，>0 表示 b 更优，0 表示比值相等。
 */
export function compareRatio(
  aCost: bigint, aGain: number | bigint,
  bCost: bigint, bGain: number | bigint,
): number {
  const lhs = aCost * BigInt(bGain);
  const rhs = bCost * BigInt(aGain);
  if (lhs < rhs) return -1;
  if (lhs > rhs) return 1;
  return 0;
}

/** 完整胜出规则：比值小者优先；比值相同取成本较小者；再相同按方案编号字符串序。 */
export function compareScored(a: Scored, b: Scored): number {
  const r = compareRatio(a.candidate.cost, a.gain, b.candidate.cost, b.gain);
  if (r !== 0) return r;
  if (a.candidate.cost !== b.candidate.cost) return a.candidate.cost < b.candidate.cost ? -1 : 1;
  return a.candidate.id < b.candidate.id ? -1 : a.candidate.id > b.candidate.id ? 1 : 0;
}

/**
 * 确定性加权集合覆盖贪心。
 * 每轮对未选候选重新计算新增覆盖，只考虑 gain>=1 者，按 compareScored 选最优。
 * 这是可解释的可行解启发式，不保证全局最优成本。
 */
export function greedySolve(problem: Problem): GreedyResult {
  const uncovered = new Set(problem.universe);
  const selected = new Set<string>();
  const steps: GreedyStep[] = [];
  let totalCost = 0n;

  while (uncovered.size > 0) {
    const scored: Scored[] = [];
    for (const c of problem.candidates) {
      if (selected.has(c.id)) continue;
      const newElements: string[] = [];
      for (const el of c.elements) {
        if (uncovered.has(el)) newElements.push(el);
      }
      if (newElements.length > 0) {
        scored.push({ candidate: c, gain: newElements.length, newElements: newElements.sort() });
      }
    }
    if (scored.length === 0) {
      return {
        algoVersion: ALGO_VERSION,
        status: "incomplete",
        steps,
        selectedIds: [...selected],
        totalCost: totalCost.toString(),
        uncovered: sortedElements(uncovered),
        message: `无法完整覆盖：剩余候选均无新增覆盖，缺少元素 ${sortedElements(uncovered).join(", ")}`,
      };
    }
    scored.sort(compareScored);
    const winner = scored[0];
    const ratios: RoundCandidateRatio[] = scored.map((s) => ({
      id: s.candidate.id,
      cost: s.candidate.cost.toString(),
      newCoverage: s.gain,
      ratio: `${s.candidate.cost.toString()}/${s.gain}`,
    }));
    for (const el of winner.newElements) uncovered.delete(el);
    selected.add(winner.candidate.id);
    totalCost += winner.candidate.cost;
    steps.push({
      round: steps.length + 1,
      chosenId: winner.candidate.id,
      chosenCost: winner.candidate.cost.toString(),
      newElements: winner.newElements,
      remainingAfter: uncovered.size,
      ratios,
    });
  }

  return {
    algoVersion: ALGO_VERSION,
    status: "complete",
    steps,
    selectedIds: [...selected],
    totalCost: totalCost.toString(),
    uncovered: [],
    message: steps.length === 0
      ? "全集为空，零成本空方案"
      : `已完整覆盖，共 ${steps.length} 轮，总成本 ${totalCost.toString()}（贪心可行解，不保证全局最优）`,
  };
}
