import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Store } from '../src/store';
import { startServer } from '../src/server';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cover-test-'));
}

const sample = {
  name: 't',
  universe: ['a', 'b', 'c'],
  candidates: [
    { id: 'P1', cost: 3, elements: ['a', 'b'] },
    { id: 'P2', cost: 2, elements: ['c'] },
  ],
};

test('导入冻结版本: 相同内容复用, 修改后产生新版本', () => {
  const store = new Store(tmpDir());
  const a = store.importInput(sample);
  const b = store.importInput(sample);
  assert.equal(a.isNew, true);
  assert.equal(b.isNew, false);
  assert.equal(a.record.id, b.record.id);
  const c = store.importInput({ ...sample, candidates: [...sample.candidates, { id: 'P3', cost: 1, elements: ['a'] }] });
  assert.equal(c.isNew, true);
  assert.notEqual(c.record.id, a.record.id);
  store.close();
});

test('批量导入失败: 非法输入被拒绝且不产生版本', () => {
  const store = new Store(tmpDir());
  assert.throws(() => store.importInput({ universe: ['a'], candidates: [{ id: 'X', cost: 0, elements: ['a'] }] }), (e: any) => e.code === 'INVALID_COST');
  assert.throws(() => store.importInput({ universe: ['a'], candidates: [{ id: 'X', cost: 1, elements: ['a'] }, { id: 'X', cost: 1, elements: ['a'] }] }), (e: any) => e.code === 'DUPLICATE_PLAN_ID');
  assert.equal(store.listInputs().length, 0);
  store.close();
});

test('重启后读取冻结报告, 报告引用冻结成本', () => {
  const dir = tmpDir();
  let store = new Store(dir);
  const inp = store.importInput(sample);
  const res = store.runGreedy(inp.record.id);
  store.close();
  // 重启(重新打开数据库)
  store = new Store(dir);
  const again = store.getResult(res.id);
  assert.deepEqual(again.payload, res.payload);
  // 按原始版本复算, 结果一致
  const recompute = store.runGreedy(inp.record.id);
  assert.deepEqual((recompute.payload as any).selectedIds, (res.payload as any).selectedIds);
  assert.equal((recompute.payload as any).totalCost, (res.payload as any).totalCost);
  store.close();
});

test('HTTP API: 导入/求解/核验/比较/导出与错误码', async () => {
  const store = new Store(tmpDir());
  const server = await startServer(store, 0);
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  const base = `http://localhost:${port}`;
  const post = async (p: string, body: unknown): Promise<{ status: number; body: any }> => {
    const r = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };

  const imp = await post('/api/inputs', sample);
  assert.equal(imp.status, 201);
  const inputId = imp.body.input.id;

  const bad = await post('/api/inputs', { universe: ['a'], candidates: [{ id: 'X', cost: -1, elements: ['a'] }] });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, 'INVALID_COST');

  const solve = await post(`/api/inputs/${inputId}/solve`, {});
  assert.equal(solve.status, 201);
  assert.equal(solve.body.result.payload.status, 'complete');

  const verify = await post(`/api/inputs/${inputId}/verify`, { planIds: ['P1', 'P1', 'P2'] });
  assert.equal(verify.body.result.payload.totalCost, '5');
  assert.deepEqual(verify.body.result.payload.duplicateIds, ['P1']);

  const unknown = await post(`/api/inputs/${inputId}/verify`, { planIds: ['NOPE'] });
  assert.equal(unknown.body.error.code, 'UNKNOWN_PLAN_ID');

  const cmp = await post(`/api/inputs/${inputId}/compare`, { planIds: ['P1', 'P2'] });
  assert.equal(cmp.body.comparison.costDiff, '0');

  const exp = await fetch(`${base}/api/results/${solve.body.result.id}/export`);
  assert.equal(exp.status, 200);
  const md = await exp.text();
  assert.match(md, /覆盖方案选择报告/);
  assert.match(md, /P1/);

  const notFound = await fetch(`${base}/api/results/9999`);
  assert.equal(notFound.status, 404);
  assert.equal((await notFound.json() as any).error.code, 'RESULT_NOT_FOUND');
  server.close();
  store.close();
});
