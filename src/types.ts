export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'DUPLICATE_PLAN_ID'
  | 'INVALID_COST'
  | 'UNKNOWN_ELEMENT'
  | 'EMPTY_UNIVERSE_TYPE'
  | 'UNKNOWN_PLAN_ID'
  | 'INPUT_NOT_FOUND'
  | 'RESULT_NOT_FOUND'
  | 'TOO_LARGE_FOR_EXHAUSTIVE'
  | 'INVALID_JSON'
  | 'NOT_FOUND'
  | 'BAD_REQUEST';

export class ApiError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: unknown,
    public httpStatus: number = 400,
  ) {
    super(message);
  }
}

export interface CandidateInput {
  id: string;
  cost: number | string;
  elements: string[];
}

export interface ProblemInput {
  name?: string;
  universe: string[];
  candidates: CandidateInput[];
}

export interface Candidate {
  id: string;
  cost: bigint;
  elements: string[]; // 去重、排序后的元素
}

export interface Problem {
  universe: string[]; // 排序后的全集
  candidates: Candidate[];
}

export interface RatioEntry {
  id: string;
  cost: string;
  newCount: number;
}

export interface Step {
  round: number;
  chosenId: string;
  chosenCost: string;
  newlyCovered: string[];
  ratios: RatioEntry[]; // 本轮所有仍有新增覆盖的候选
  cumulativeCost: string;
  remainingUncovered: number;
}

export interface SolveResult {
  algo: 'greedy-v1' | 'exhaustive-v1';
  status: 'complete' | 'infeasible';
  selectedIds: string[];
  totalCost: string;
  uncovered: string[];
  steps: Step[];
  note?: string;
}

export interface VerifyResult {
  status: 'complete' | 'incomplete';
  planIds: string[]; // 去重后
  duplicateIds: string[]; // 重复提交、未重复计费的编号
  covered: string[];
  uncovered: string[];
  totalCost: string;
}
