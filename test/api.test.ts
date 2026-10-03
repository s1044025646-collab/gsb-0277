import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDb } from "../src/db.js";
import { CoverService } from "../src/service.js";
import { startApi } from "../src/api.js";

const SAMPLE = {
  universe: ["CHK-A", "CHK-B", "CHK-C"],
  candidates: [
    { id: "PKG-PAIR", cost: 3, elements: ["CHK-A", "CHK-B"] },
    { id: "PKG-SOLO", cost: 2, elements: ["CHK-A"] },
    { id: "PKG-TAIL", cost: 4, elements: ["CHK-B", "CHK-C"] },
  ],
};

test("HTTP API 端到端：导入/运行/核验/比较/穷举/导出", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "cover-api-"));
  const db = openDb(path.join(dir, "t.db"));
  const svc = new CoverService(db);
  const { server, port } = await startApi(svc, 0);
  t.after(() => {
    server.close();
    db.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  });
  const base = `http://127.0.0.1:${port}`;
  assert.ok(port > 0, "默认应自动选择空闲端口");

  const post = async (p: string, body?: unknown): Promise<{ status: number; body: any }> => {
    const res = await fetch(base + p, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };

  const imp = await post("/api/inputs", SAMPLE);
  assert.equal(imp.status, 201);
  const versionId = imp.body.versionId;

  const run = await post(`/api/inputs/${versionId}/run`);
  assert.equal(run.status, 200);
  assert.equal(run.body.status, "complete");
  assert.equal(run.body.totalCost, "7");
  assert.ok(Array.isArray(run.body.steps));
  assert.ok(run.body.steps[0].ratios.length > 0);

  const verify = await post(`/api/inputs/${versionId}/verify`, { selected: ["PKG-SOLO", "PKG-TAIL", "PKG-TAIL"] });
  assert.equal(verify.body.ok, true);
  assert.equal(verify.body.totalCost, "6");
  assert.deepEqual(verify.body.duplicatesIgnored, ["PKG-TAIL"]);

  const badVerify = await post(`/api/inputs/${versionId}/verify`, { selected: ["NOPE"] });
  assert.equal(badVerify.status, 400);
  assert.equal(badVerify.body.error.code, "UNKNOWN_CANDIDATE_ID");

  const cmp = await post(`/api/inputs/${versionId}/compare`, { selected: ["PKG-SOLO", "PKG-TAIL"] });
  assert.equal(cmp.body.costDelta, "-1");

  const exh = await post(`/api/inputs/${versionId}/exhaustive`);
  assert.equal(exh.body.bestCost, "6");

  const badImport = await post("/api/inputs", { universe: ["a"], candidates: [{ id: "X", cost: 0, elements: ["a"] }] });
  assert.equal(badImport.status, 400);
  assert.equal(badImport.body.error.code, "INVALID_COST");

  const report = await fetch(`${base}/api/runs/${run.body.runId}/report?format=md`);
  assert.equal(report.status, 200);
  const md = await report.text();
  assert.match(md, /选择过程/);
  assert.match(md, /PKG-PAIR/);

  const runs = await fetch(`${base}/api/runs?versionId=${versionId}`);
  assert.ok(((await runs.json()) as unknown[]).length >= 4);
});
