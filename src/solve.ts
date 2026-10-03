import { ApiError, Problem, SolveResult, VerifyResult } from './types';

export const EXHAUSTIVE_ALGO_VERSION = 'exhaustive-v1';
export const EXHAUSTIVE_MAX_CANDIDATES = 22;

/** 小规模穷举核验：枚举全部子集，找覆盖全集的最小成本(平局按编号集合字典序)。仅用于测试/演示。 */
export function exhaustiveSolve(problem: Problem): SolveResult {
  const { universe, candidates } = problem;
  if (universe.length === 0) {
    return {
      algo: EXHAUSTIVE_ALGO_VERSION,
      status: 'complete',
      selectedIds: [],
      totalCost: '0',
      uncovered: [],
      steps: [],
      note: '全集为空，零成本空方案即完整覆盖',
    };
  }
  if (candidates.length > EXHAUSTIVE_MAX_CANDIDATES) {
    throw new ApiError(
      'TOO_LARGE_FOR_EXHAUSTIVE',
      `候选数 ${candidates.length} 超过穷举上限 ${EXHAUSTIVE_MAX_CANDIDATES}`,
    );
  }
  const n = candidates.length;
  let bestCost: bigint | null = null;
  let bestIds: string[] = [];
  const total = 1 << n;
  for (let mask = 0; mask < total; mask++) {
    const covered = new Set<string>();
    let cost = 0n;
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      if (!(mask & (1 << i))) continue;
      const c = candidates[i];
      cost += c.cost;
      if (bestCost !== null && cost >= bestCost) break;
      ids.push(c.id);
      for (const e of c.elements) covered.add(e);
    }
    if (covered.size < universe.length) continue;
    if (universe.some((e) => !covered.has(e))) continue;
    if (bestCost === null || cost < bestCost || (cost === bestCost && ids.join('') < bestIds.join(''))) {
      bestCost = cost;
      bestIds = ids;
    }
  }
  if (bestCost === null) {
    return {
      algo: EXHAUSTIVE_ALGO_VERSION,
      status: 'infeasible',
      selectedIds: [],
      totalCost: '0',
      uncovered: universe.filter((e) => !candidates.some((c) => c.elements.includes(e))),
      steps: [],
      note: '穷举全部子集后仍无法覆盖全集',
    };
  }
  return {
    algo: EXHAUSTIVE_ALGO_VERSION,
    status: 'complete',
    selectedIds: [...bestIds].sort(),
    totalCost: bestCost.toString(),
    uncovered: [],
    steps: [],
  };
}

/** 独立核验：按给定方案编号集合重新计算覆盖与成本；重复编号不重复覆盖/计费；未知编号报错。 */
export function verifyPlan(problem: Problem, planIds: unknown): VerifyResult {
  if (!Array.isArray(planIds) || planIds.some((x) => typeof x !== 'string')) {
    throw new ApiError('VALIDATION_ERROR', 'planIds 必须是字符串数组');
  }
  const byId = new Map(problem.candidates.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const duplicateIds: string[] = [];
  const covered = new Set<string>();
  let totalCost = 0n;
  for (const id of planIds as string[]) {
    const c = byId.get(id);
    if (!c) throw new ApiError('UNKNOWN_PLAN_ID', `未知的方案编号: ${id}`);
    if (seen.has(id)) {
      duplicateIds.push(id);
      continue; // 不重复覆盖、不重复计费
    }
    seen.add(id);
    for (const e of c.elements) covered.add(e);
    totalCost += c.cost;
  }
  const uncovered = problem.universe.filter((e) => !covered.has(e));
  return {
    status: uncovered.length === 0 ? 'complete' : 'incomplete',
    planIds: [...seen].sort(),
    duplicateIds: [...new Set(duplicateIds)].sort(),
    covered: [...covered].sort(),
    uncovered,
    totalCost: totalCost.toString(),
  };
}
