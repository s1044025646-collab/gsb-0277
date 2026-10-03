import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDb } from "../src/db.js";
import { CoverService } from "../src/service.js";
import { ApiError } from "../src/errors.js";

const SAMPLE = {
  universe: ["CHK-01", "CHK-02", "CHK-03", "CHK-04"],
  candidates: [
    { id: "PKG-ALPHA", cost: 4, elements: ["CHK-01", "CHK-02", "CHK-01"] },
    { id: "PKG-BETA", cost: 6, elements: ["CHK-01", "CHK-02", "CHK-03"] },
    { id: "PKG-GAMMA", cost: 6, elements: ["CHK-03", "CHK-04"] },
    { id: "PKG-DELTA", cost: 5, elements: ["CHK-02"] },
  ],
};

function tmpDir(): string {
  return mkdtempSync(path.join(tmpdir(), "cover-select-"));
}

function cleanup(db: { close(): void }, dir: string): void {
  db.close();
  rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
}

test("导入相同输入复用版本，修改输入产生新版本", () => {
  const dir = tmpDir();
  const db = openDb(path.join(dir, "t.db"));
  try {
    const svc = new CoverService(db);
    const a = svc.importInput(SAMPLE);
    const b = svc.importInput(SAMPLE);
    assert.equal(a.created, true);
    assert.equal(b.created, false);
    assert.equal(a.versionId, b.versionId);
    const changed = svc.importInput({ ...SAMPLE, universe: [...SAMPLE.universe, "CHK-05"] });
    assert.equal(changed.created, true);
    assert.notEqual(changed.versionId, a.versionId);
    assert.equal(svc.listVersions().length, 2);
  } finally {
    cleanup(db, dir);
  }
});

test("批量导入失败：任一候选非法则整体拒绝，不产生版本", () => {
  const dir = tmpDir();
  const db = openDb(path.join(dir, "t.db"));
  try {
    const svc = new CoverService(db);
    assert.throws(
      () =>
        svc.importInput({
          universe: ["a", "b"],
          candidates: [
            { id: "OK", cost: 1, elements: ["a"] },
            { id: "BAD", cost: -1, elements: ["b"] },
          ],
        }),
      (e) => e instanceof ApiError && e.code === "INVALID_COST",
    );
    assert.equal(svc.listVersions().length, 0);
  } finally {
    cleanup(db, dir);
  }
});

test("重启后读取冻结报告：成本不随后续输入变化", () => {
  const dir = tmpDir();
  const dbFile = path.join(dir, "t.db");
  const db1 = openDb(dbFile);
  let runId: number;
  let versionId: number;
  try {
    const svc = new CoverService(db1);
    const v1 = svc.importInput(SAMPLE);
    versionId = v1.versionId;
    const run = svc.runGreedy(versionId);
    runId = run.runId;
    assert.equal(run.totalCost, "10");
  } finally {
    db1.close();
  }
  // 模拟重启：重新打开同一数据库文件
  const db2 = openDb(dbFile);
  try {
    const svc = new CoverService(db2);
    const frozen = svc.getRun(runId);
    assert.equal(frozen.result.totalCost, "10");
    // 后续导入修改了成本，产生新版本，但旧报告不变
    const modified = svc.importInput({
      ...SAMPLE,
      candidates: SAMPLE.candidates.map((c) => (c.id === "PKG-ALPHA" ? { ...c, cost: 999 } : c)),
    });
    assert.equal(modified.created, true);
    const again = svc.getRun(runId);
    assert.equal(again.result.totalCost, "10");
    assert.equal(again.versionId, versionId);
    // 按原始版本复算，结果一致
    const rerun = svc.runGreedy(versionId);
    assert.equal(rerun.totalCost, "10");
  } finally {
    cleanup(db2, dir);
  }
});

test("比较接口：用户方案 vs 贪心", () => {
  const dir = tmpDir();
  const db = openDb(path.join(dir, "t.db"));
  try {
    const svc = new CoverService(db);
    const v = svc.importInput(SAMPLE);
    const cmp = svc.compare(v.versionId, ["PKG-BETA", "PKG-GAMMA"]);
    assert.equal(cmp.user.ok, true);
    assert.equal(cmp.user.totalCost, "12");
    assert.equal(cmp.greedy.totalCost, "10");
    assert.equal(cmp.costDelta, "2");
  } finally {
    cleanup(db, dir);
  }
});

test("未知版本与未知运行记录返回 NOT_FOUND", () => {
  const dir = tmpDir();
  const db = openDb(path.join(dir, "t.db"));
  try {
    const svc = new CoverService(db);
    assert.throws(() => svc.runGreedy(999), (e) => e instanceof ApiError && e.code === "NOT_FOUND");
    assert.throws(() => svc.getRun(999), (e) => e instanceof ApiError && e.code === "NOT_FOUND");
  } finally {
    cleanup(db, dir);
  }
});
