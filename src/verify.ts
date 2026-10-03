import { ApiError } from "./errors.js";
import type { Problem, VerifyResult } from "./types.js";
import { sortedElements } from "./validate.js";

/**
 * 独立核验：按给定方案编号集合重新计算覆盖与成本。
 * 重复编号只计一次覆盖与一次费用；未知编号报错。
 */
export function verifySelection(problem: Problem, ids: unknown): VerifyResult {
  if (!Array.isArray(ids) || ids.some((x) => typeof x !== "string")) {
    throw new ApiError("INVALID_INPUT", "selected 必须是方案编号字符串数组");
  }
  const byId = new Map(problem.candidates.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const duplicatesIgnored: string[] = [];
  const covered = new Set<string>();
  let totalCost = 0n;
  const selectedIds: string[] = [];

  for (const id of ids as string[]) {
    const c = byId.get(id);
    if (!c) {
      throw new ApiError("UNKNOWN_CANDIDATE_ID", `未知方案编号: "${id}"`);
    }
    if (seen.has(id)) {
      duplicatesIgnored.push(id);
      continue;
    }
    seen.add(id);
    selectedIds.push(id);
    totalCost += c.cost;
    for (const el of c.elements) covered.add(el);
  }

  const uncovered = new Set<string>();
  for (const el of problem.universe) {
    if (!covered.has(el)) uncovered.add(el);
  }
  const ok = uncovered.size === 0;
  return {
    ok,
    selectedIds,
    covered: sortedElements(covered),
    uncovered: sortedElements(uncovered),
    totalCost: totalCost.toString(),
    duplicatesIgnored,
    message: ok
      ? `核验通过：覆盖全集，总成本 ${totalCost.toString()}`
      : `核验未通过：缺少元素 ${sortedElements(uncovered).join(", ")}`,
  };
}
