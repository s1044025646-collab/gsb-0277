import { ApiError } from "./errors.js";
import type { Candidate, Problem, ProblemInput } from "./types.js";

export const ALGO_VERSION = "greedy-v1";

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

/** 成本必须为正整数。接受 number 或十进制字符串，内部统一转 BigInt 以支持大整数。 */
export function parseCost(raw: unknown, ctx: string): bigint {
  if (typeof raw === "number") {
    if (!Number.isSafeInteger(raw) || raw <= 0) {
      throw new ApiError("INVALID_COST", `${ctx}: 成本必须是正整数（number 需为安全整数），收到 ${raw}`);
    }
    return BigInt(raw);
  }
  if (typeof raw === "string" && /^[0-9]+$/.test(raw)) {
    const v = BigInt(raw);
    if (v <= 0n) {
      throw new ApiError("INVALID_COST", `${ctx}: 成本必须为正整数，收到 "${raw}"`);
    }
    return v;
  }
  throw new ApiError("INVALID_COST", `${ctx}: 成本必须是正整数，收到 ${JSON.stringify(raw)}`);
}

export function validateProblem(raw: unknown): Problem {
  if (typeof raw !== "object" || raw === null) {
    throw new ApiError("INVALID_INPUT", "输入必须是对象 { universe, candidates }");
  }
  const input = raw as Partial<ProblemInput>;

  if (!Array.isArray(input.universe)) {
    throw new ApiError("INVALID_UNIVERSE", "universe 必须是字符串数组（允许为空数组）");
  }
  const universe = new Set<string>();
  for (const el of input.universe) {
    if (!isNonEmptyString(el)) {
      throw new ApiError("INVALID_ELEMENT", `全集元素必须是非空字符串，收到 ${JSON.stringify(el)}`);
    }
    universe.add(el); // 全集内重复按集合处理
  }

  if (!Array.isArray(input.candidates)) {
    throw new ApiError("INVALID_INPUT", "candidates 必须是数组");
  }
  const seenIds = new Set<string>();
  const candidates: Candidate[] = input.candidates.map((c, i) => {
    const ctx = `candidates[${i}]`;
    if (typeof c !== "object" || c === null) {
      throw new ApiError("INVALID_INPUT", `${ctx}: 必须是对象 { id, cost, elements }`);
    }
    if (!isNonEmptyString(c.id)) {
      throw new ApiError("INVALID_INPUT", `${ctx}: id 必须是非空字符串`);
    }
    if (seenIds.has(c.id)) {
      throw new ApiError("DUPLICATE_CANDIDATE_ID", `方案编号重复: "${c.id}"`);
    }
    seenIds.add(c.id);
    const cost = parseCost(c.cost, `${ctx} (id="${c.id}")`);
    if (!Array.isArray(c.elements)) {
      throw new ApiError("INVALID_INPUT", `${ctx} (id="${c.id}"): elements 必须是字符串数组`);
    }
    const elements = new Set<string>();
    const duplicatesRemoved: string[] = [];
    for (const el of c.elements) {
      if (!isNonEmptyString(el)) {
        throw new ApiError("INVALID_ELEMENT", `${ctx} (id="${c.id}"): 覆盖元素必须是非空字符串，收到 ${JSON.stringify(el)}`);
      }
      if (!universe.has(el)) {
        throw new ApiError("ELEMENT_NOT_IN_UNIVERSE", `方案 "${c.id}" 引用了全集之外的元素 "${el}"`);
      }
      if (elements.has(el)) {
        duplicatesRemoved.push(el);
      } else {
        elements.add(el);
      }
    }
    return { id: c.id, cost, elements, duplicatesRemoved };
  });

  return { universe, candidates };
}

/** 元素排序固定化：按码元序，保证不同输入行序下输出一致。 */
export function sortedElements(set: Set<string>): string[] {
  return [...set].sort();
}
