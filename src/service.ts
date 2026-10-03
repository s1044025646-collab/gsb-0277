import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { ApiError } from "./errors.js";
import { greedySolve } from "./greedy.js";
import { exhaustiveSolve } from "./exhaustive.js";
import { verifySelection } from "./verify.js";
import { ALGO_VERSION, sortedElements, validateProblem } from "./validate.js";
import type { Candidate, Problem } from "./types.js";

interface VersionRow {
  id: number;
  created_at: string;
  algo_version: string;
  hash: string;
  universe_json: string;
  candidates_json: string;
}

interface RunRow {
  id: number;
  version_id: number;
  created_at: string;
  kind: string;
  request_json: string;
  result_json: string;
}

interface FrozenCandidate {
  id: string;
  cost: string;
  elements: string[];
  duplicatesRemoved: string[];
}

function freezeProblem(problem: Problem): { universe: string[]; candidates: FrozenCandidate[] } {
  return {
    universe: sortedElements(problem.universe),
    candidates: problem.candidates.map((c) => ({
      id: c.id,
      cost: c.cost.toString(),
      elements: sortedElements(c.elements),
      duplicatesRemoved: c.duplicatesRemoved,
    })),
  };
}

function thawProblem(row: VersionRow): Problem {
  const universe = new Set<string>(JSON.parse(row.universe_json) as string[]);
  const frozen = JSON.parse(row.candidates_json) as FrozenCandidate[];
  const candidates: Candidate[] = frozen.map((c) => ({
    id: c.id,
    cost: BigInt(c.cost),
    elements: new Set(c.elements),
    duplicatesRemoved: c.duplicatesRemoved,
  }));
  return { universe, candidates };
}

function hashProblem(frozen: unknown): string {
  return createHash("sha256").update(JSON.stringify(frozen)).digest("hex");
}

export class CoverService {
  constructor(private readonly db: DatabaseSync) {}

  /** 导入输入；内容变化产生新版本，内容相同复用旧版本。 */
  importInput(raw: unknown) {
    const problem = validateProblem(raw);
    const frozen = freezeProblem(problem);
    const hash = hashProblem({ algoVersion: ALGO_VERSION, ...frozen });
    const existing = this.db
      .prepare("SELECT * FROM input_versions WHERE hash = ?")
      .get(hash) as VersionRow | undefined;
    if (existing) {
      return { versionId: existing.id, created: false, algoVersion: existing.algo_version, input: frozen };
    }
    const info = this.db
      .prepare(
        "INSERT INTO input_versions (created_at, algo_version, hash, universe_json, candidates_json) VALUES (?, ?, ?, ?, ?)",
      )
      .run(new Date().toISOString(), ALGO_VERSION, hash, JSON.stringify(frozen.universe), JSON.stringify(frozen.candidates));
    return { versionId: Number(info.lastInsertRowid), created: true, algoVersion: ALGO_VERSION, input: frozen };
  }

  listVersions() {
    const rows = this.db
      .prepare("SELECT id, created_at, algo_version, hash FROM input_versions ORDER BY id")
      .all() as unknown as VersionRow[];
    return rows.map((r) => ({ versionId: r.id, createdAt: r.created_at, algoVersion: r.algo_version, hash: r.hash }));
  }

  getVersion(versionId: number) {
    const row = this.db.prepare("SELECT * FROM input_versions WHERE id = ?").get(versionId) as VersionRow | undefined;
    if (!row) throw new ApiError("NOT_FOUND", `输入版本 ${versionId} 不存在`, 404);
    return {
      versionId: row.id,
      createdAt: row.created_at,
      algoVersion: row.algo_version,
      universe: JSON.parse(row.universe_json),
      candidates: JSON.parse(row.candidates_json),
    };
  }

  private loadProblem(versionId: number): { row: VersionRow; problem: Problem } {
    const row = this.db.prepare("SELECT * FROM input_versions WHERE id = ?").get(versionId) as VersionRow | undefined;
    if (!row) throw new ApiError("NOT_FOUND", `输入版本 ${versionId} 不存在`, 404);
    return { row, problem: thawProblem(row) };
  }

  private saveRun(versionId: number, kind: string, request: unknown, result: unknown) {
    const info = this.db
      .prepare("INSERT INTO runs (version_id, created_at, kind, request_json, result_json) VALUES (?, ?, ?, ?, ?)")
      .run(versionId, new Date().toISOString(), kind, JSON.stringify(request ?? null), JSON.stringify(result));
    return Number(info.lastInsertRowid);
  }

  /** 按冻结的原始版本运行贪心选择并保存结果。 */
  runGreedy(versionId: number) {
    const { problem } = this.loadProblem(versionId);
    const result = greedySolve(problem);
    const runId = this.saveRun(versionId, "greedy", { versionId }, result);
    return { runId, versionId, ...result };
  }

  /** 独立核验用户给定方案编号集合。 */
  verify(versionId: number, ids: unknown) {
    const { problem } = this.loadProblem(versionId);
    const result = verifySelection(problem, ids);
    const runId = this.saveRun(versionId, "verify", { selected: ids }, result);
    return { runId, versionId, ...result };
  }

  /** 比较用户方案与贪心结果。 */
  compare(versionId: number, ids: unknown) {
    const { problem } = this.loadProblem(versionId);
    const user = verifySelection(problem, ids);
    const greedy = greedySolve(problem);
    const result = {
      user,
      greedy: {
        selectedIds: greedy.selectedIds,
        totalCost: greedy.totalCost,
        status: greedy.status,
      },
      costDelta: (BigInt(user.totalCost) - BigInt(greedy.totalCost)).toString(),
      note: "costDelta 为用户方案成本减去贪心成本；贪心为启发式可行解，不保证全局最优",
    };
    const runId = this.saveRun(versionId, "compare", { selected: ids }, result);
    return { runId, versionId, ...result };
  }

  /** 小规模穷举核验（仅测试/演示用途）。 */
  exhaustive(versionId: number) {
    const { problem } = this.loadProblem(versionId);
    const result = exhaustiveSolve(problem);
    const runId = this.saveRun(versionId, "exhaustive", { versionId }, result);
    return { runId, versionId, ...result };
  }

  listRuns(versionId?: number) {
    const rows = (
      versionId === undefined
        ? this.db.prepare("SELECT * FROM runs ORDER BY id").all()
        : this.db.prepare("SELECT * FROM runs WHERE version_id = ? ORDER BY id").all(versionId)
    ) as unknown as RunRow[];
    return rows.map((r) => ({
      runId: r.id,
      versionId: r.version_id,
      createdAt: r.created_at,
      kind: r.kind,
    }));
  }

  getRun(runId: number) {
    const row = this.db.prepare("SELECT * FROM runs WHERE id = ?").get(runId) as RunRow | undefined;
    if (!row) throw new ApiError("NOT_FOUND", `运行记录 ${runId} 不存在`, 404);
    return {
      runId: row.id,
      versionId: row.version_id,
      createdAt: row.created_at,
      kind: row.kind,
      request: JSON.parse(row.request_json),
      result: JSON.parse(row.result_json),
    };
  }
}
