import { ApiError } from "./errors.js";
import type { Problem } from "./types.js";

export const EXHAUSTIVE_LIMIT = 22;

export interface ExhaustiveResult {
  feasible: boolean;
  bestIds: string[];
  bestCost: string;
  subsetsChecked: number;
  note: string;
}

/**
 * 小规模穷举核验：枚举全部候选子集，独立核对覆盖与成本，返回全局最优。
 * 仅用于测试/演示，正式求解不调用。候选数超过 EXHAUSTIVE_LIMIT 拒绝。
 */
export function exhaustiveSolve(problem: Problem): ExhaustiveResult {
  const n = problem.candidates.length;
  if (n > EXHAUSTIVE_LIMIT) {
    throw new ApiError(
      "EXHAUSTIVE_TOO_LARGE",
      `候选数 ${n} 超过穷举上限 ${EXHAUSTIVE_LIMIT}，穷举仅用于小规模核验`,
    );
  }
  const universe = [...problem.universe];
  const index = new Map(universe.map((el, i) => [el, i]));
  const masks = problem.candidates.map((c) => {
    let m = 0n;
    for (const el of c.elements) m |= 1n << BigInt(index.get(el)!);
    return m;
  });
  const full = (1n << BigInt(universe.length)) - 1n;

  let bestCost: bigint | null = null;
  let bestIds: string[] = [];
  let checked = 0;
  const total = 1 << n;
  for (let s = 0; s < total; s++) {
    checked++;
    let mask = 0n;
    let cost = 0n;
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      if (s & (1 << i)) {
        mask |= masks[i];
        cost += problem.candidates[i].cost;
        ids.push(problem.candidates[i].id);
      }
    }
    if (mask === full && (bestCost === null || cost < bestCost)) {
      bestCost = cost;
      bestIds = ids;
    }
  }
  return {
    feasible: bestCost !== null,
    bestIds,
    bestCost: bestCost === null ? "0" : bestCost.toString(),
    subsetsChecked: checked,
    note: "穷举结果为小规模全局最优，仅用于核验对比；正式求解使用贪心启发式",
  };
}
