import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ApiError, Problem, SolveResult, VerifyResult } from './types';
import { validateProblem, DedupNote } from './validate';
import { GREEDY_ALGO_VERSION, greedySolve } from './greedy';
import { EXHAUSTIVE_ALGO_VERSION, exhaustiveSolve, verifyPlan } from './solve';

export interface InputRecord {
  id: number;
  name: string;
  hash: string;
  universe: string[];
  candidates: { id: string; cost: string; elements: string[] }[];
  dedupNotes: DedupNote[];
  createdAt: string;
}

export interface ResultRecord {
  id: number;
  inputId: number;
  kind: 'greedy' | 'exhaustive' | 'verify';
  algo: string;
  payload: SolveResult | (VerifyResult & { algo: string });
  createdAt: string;
}

export class Store {
  private db: DatabaseSync;

  constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.db = new DatabaseSync(path.join(dataDir, 'cover.db'));
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS inputs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        hash TEXT NOT NULL UNIQUE,
        universe TEXT NOT NULL,
        candidates TEXT NOT NULL,
        dedup_notes TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        input_id INTEGER NOT NULL REFERENCES inputs(id),
        kind TEXT NOT NULL,
        algo TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
  }

  close() { this.db.close(); }

  /** 导入输入；内容哈希相同则复用已有版本，修改后产生新版本。全集/候选/算法版本随记录冻结。 */
  importInput(raw: unknown, name?: string): { record: InputRecord; isNew: boolean } {
    const { problem, dedupNotes } = validateProblem(raw);
    const frozenCandidates = problem.candidates.map((c) => ({
      id: c.id,
      cost: c.cost.toString(),
      elements: c.elements,
    }));
    const hash = createHash('sha256')
      .update(JSON.stringify({ universe: problem.universe, candidates: frozenCandidates, algo: GREEDY_ALGO_VERSION }))
      .digest('hex');
    const existing = this.db.prepare('SELECT * FROM inputs WHERE hash = ?').get(hash) as any;
    if (existing) return { record: rowToInput(existing), isNew: false };
    const now = new Date().toISOString();
    const inputName = name ?? (typeof (raw as any)?.name === 'string' ? (raw as any).name : `input-${hash.slice(0, 8)}`);
    const r = this.db
      .prepare('INSERT INTO inputs (name, hash, universe, candidates, dedup_notes, created_at) VALUES (?,?,?,?,?,?)')
      .run(inputName, hash, JSON.stringify(problem.universe), JSON.stringify(frozenCandidates), JSON.stringify(dedupNotes), now);
    return { record: this.getInput(Number(r.lastInsertRowid)), isNew: true };
  }

  getInput(id: number): InputRecord {
    const row = this.db.prepare('SELECT * FROM inputs WHERE id = ?').get(id) as any;
    if (!row) throw new ApiError('INPUT_NOT_FOUND', `输入版本不存在: ${id}`, undefined, 404);
    return rowToInput(row);
  }

  listInputs(): InputRecord[] {
    return (this.db.prepare('SELECT * FROM inputs ORDER BY id').all() as any[]).map(rowToInput);
  }

  getProblem(inputId: number): Problem {
    const rec = this.getInput(inputId);
    return {
      universe: rec.universe,
      candidates: rec.candidates.map((c) => ({ id: c.id, cost: BigInt(c.cost), elements: c.elements })),
    };
  }

  runGreedy(inputId: number): ResultRecord {
    const result = greedySolve(this.getProblem(inputId));
    return this.saveResult(inputId, 'greedy', GREEDY_ALGO_VERSION, result);
  }

  runExhaustive(inputId: number): ResultRecord {
    const result = exhaustiveSolve(this.getProblem(inputId));
    return this.saveResult(inputId, 'exhaustive', EXHAUSTIVE_ALGO_VERSION, result);
  }

  runVerify(inputId: number, planIds: unknown): ResultRecord {
    const v = verifyPlan(this.getProblem(inputId), planIds);
    return this.saveResult(inputId, 'verify', 'verify-v1', { algo: 'verify-v1', ...v });
  }

  private saveResult(inputId: number, kind: ResultRecord['kind'], algo: string, payload: unknown): ResultRecord {
    this.getInput(inputId);
    const now = new Date().toISOString();
    const r = this.db
      .prepare('INSERT INTO results (input_id, kind, algo, payload, created_at) VALUES (?,?,?,?,?)')
      .run(inputId, kind, algo, JSON.stringify(payload), now);
    return this.getResult(Number(r.lastInsertRowid));
  }

  getResult(id: number): ResultRecord {
    const row = this.db.prepare('SELECT * FROM results WHERE id = ?').get(id) as any;
    if (!row) throw new ApiError('RESULT_NOT_FOUND', `结果不存在: ${id}`, undefined, 404);
    return rowToResult(row);
  }

  listResults(inputId?: number): ResultRecord[] {
    const rows = inputId == null
      ? this.db.prepare('SELECT * FROM results ORDER BY id').all()
      : this.db.prepare('SELECT * FROM results WHERE input_id = ? ORDER BY id').all(inputId);
    return (rows as any[]).map(rowToResult);
  }
}

function rowToInput(row: any): InputRecord {
  return {
    id: row.id,
    name: row.name,
    hash: row.hash,
    universe: JSON.parse(row.universe),
    candidates: JSON.parse(row.candidates),
    dedupNotes: JSON.parse(row.dedup_notes),
    createdAt: row.created_at,
  };
}

function rowToResult(row: any): ResultRecord {
  return {
    id: row.id,
    inputId: row.input_id,
    kind: row.kind,
    algo: row.algo,
    payload: JSON.parse(row.payload),
    createdAt: row.created_at,
  };
}
