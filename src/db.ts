import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

export function defaultDataDir(): string {
  return process.env.COVER_SELECT_DATA_DIR ?? path.join(process.cwd(), "data");
}

export function openDb(dbPath?: string): DatabaseSync {
  const file = dbPath ?? path.join(defaultDataDir(), "cover-select.db");
  if (file !== ":memory:") {
    mkdirSync(path.dirname(file), { recursive: true });
  }
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS input_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      algo_version TEXT NOT NULL,
      hash TEXT NOT NULL UNIQUE,
      universe_json TEXT NOT NULL,
      candidates_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version_id INTEGER NOT NULL REFERENCES input_versions(id),
      created_at TEXT NOT NULL,
      kind TEXT NOT NULL,
      request_json TEXT NOT NULL,
      result_json TEXT NOT NULL
    );
  `);
  return db;
}
