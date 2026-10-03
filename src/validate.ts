import { ApiError, Candidate, Problem, ProblemInput } from './types';

export interface DedupNote {
  id: string;
  removed: string[];
}

export interface ValidatedInput {
  problem: Problem;
  dedupNotes: DedupNote[];
}

function parseCost(raw: unknown, id: string): bigint {
  if (typeof raw === 'number') {
    if (!Number.isSafeInteger(raw)) {
      throw new ApiError('INVALID_COST', `方案 ${id} 的成本不是安全整数: ${raw}`);
    }
    if (raw <= 0) throw new ApiError('INVALID_COST', `方案 ${id} 的成本必须为正整数: ${raw}`);
    return BigInt(raw);
  }
  if (typeof raw === 'string' && /^[0-9]+$/.test(raw)) {
    const v = BigInt(raw);
    if (v <= 0n) throw new ApiError('INVALID_COST', `方案 ${id} 的成本必须为正整数: ${raw}`);
    return v;
  }
  throw new ApiError('INVALID_COST', `方案 ${id} 的成本必须为正整数(数字或数字字符串): ${JSON.stringify(raw)}`);
}

export function validateProblem(raw: unknown): ValidatedInput {
  if (typeof raw !== 'object' || raw === null) {
    throw new ApiError('VALIDATION_ERROR', '输入必须是 JSON 对象');
  }
  const input = raw as ProblemInput;
  if (!Array.isArray(input.universe)) {
    throw new ApiError('VALIDATION_ERROR', 'universe 必须是字符串数组');
  }
  for (const e of input.universe) {
    if (typeof e !== 'string' || e.length === 0) {
      throw new ApiError('VALIDATION_ERROR', `全集元素必须是非空字符串: ${JSON.stringify(e)}`);
    }
  }
  const universe = [...new Set(input.universe)].sort();
  if (!Array.isArray(input.candidates)) {
    throw new ApiError('VALIDATION_ERROR', 'candidates 必须是数组');
  }
  const seen = new Set<string>();
  const universeSet = new Set(universe);
  const candidates: Candidate[] = [];
  const dedupNotes: DedupNote[] = [];
  for (const c of input.candidates) {
    if (typeof c !== 'object' || c === null) {
      throw new ApiError('VALIDATION_ERROR', '候选方案必须是对象');
    }
    if (typeof c.id !== 'string' || c.id.length === 0) {
      throw new ApiError('VALIDATION_ERROR', `方案编号必须是非空字符串: ${JSON.stringify(c.id)}`);
    }
    if (seen.has(c.id)) {
      throw new ApiError('DUPLICATE_PLAN_ID', `方案编号重复: ${c.id}`);
    }
    seen.add(c.id);
    const cost = parseCost(c.cost, c.id);
    if (!Array.isArray(c.elements)) {
      throw new ApiError('VALIDATION_ERROR', `方案 ${c.id} 的 elements 必须是字符串数组`);
    }
    for (const e of c.elements) {
      if (typeof e !== 'string' || e.length === 0) {
        throw new ApiError('VALIDATION_ERROR', `方案 ${c.id} 的元素必须是非空字符串: ${JSON.stringify(e)}`);
      }
      if (!universeSet.has(e)) {
        throw new ApiError('UNKNOWN_ELEMENT', `方案 ${c.id} 引用了全集之外的元素: ${e}`);
      }
    }
    const deduped = [...new Set(c.elements)].sort();
    const removed = c.elements.filter((e, i) => c.elements.indexOf(e) !== i);
    if (removed.length > 0) dedupNotes.push({ id: c.id, removed: [...new Set(removed)].sort() });
    candidates.push({ id: c.id, cost, elements: deduped });
  }
  return { problem: { universe, candidates }, dedupNotes };
}
