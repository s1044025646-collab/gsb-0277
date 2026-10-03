export interface CandidateInput {
  id: string;
  cost: number | string;
  elements: string[];
}

export interface ProblemInput {
  universe: string[];
  candidates: CandidateInput[];
}

export interface Candidate {
  id: string;
  cost: bigint;
  elements: Set<string>;
  /** 输入清单中被去掉的重复元素（按出现顺序去重后的重复项） */
  duplicatesRemoved: string[];
}

export interface Problem {
  universe: Set<string>;
  candidates: Candidate[];
}

export interface RoundCandidateRatio {
  id: string;
  cost: string;
  newCoverage: number;
  /** 以 "cost/newCoverage" 表示的比值，未做小数舍入 */
  ratio: string;
}

export interface GreedyStep {
  round: number;
  chosenId: string;
  chosenCost: string;
  newElements: string[];
  remainingAfter: number;
  /** 本轮所有仍有新增覆盖的候选及其比值，按胜出规则排序 */
  ratios: RoundCandidateRatio[];
}

export interface GreedyResult {
  algoVersion: string;
  status: "complete" | "incomplete";
  steps: GreedyStep[];
  selectedIds: string[];
  totalCost: string;
  uncovered: string[];
  message: string;
}

export interface VerifyResult {
  ok: boolean;
  selectedIds: string[];
  covered: string[];
  uncovered: string[];
  totalCost: string;
  duplicatesIgnored: string[];
  message: string;
}
