import { test } from 'node:test';
import assert from 'node:assert/strict';
import { greedySolve } from '../src/greedy';
import { exhaustiveSolve, verifyPlan } from '../src/solve';
import { validateProblem } from '../src/validate';
import { Problem } from '../src/types';

function problem(universe: string[], candidates: [string, number | string, string[]][]): Problem {
  return validateProblem({
    universe,
    candidates: candidates.map(([id, cost, elements]) => ({ id, cost, elements })),
  }).problem;
}

test('交叉乘法比较: 大整数成本不经过浮点舍入', () => {
  // 9007199254740993/2 vs 4503599627370496/1: 浮点会误判, 交叉相乘可区分
  const p = problem(['a', 'b'], [
    ['BIG-A', '9007199254740993', ['a', 'b']],
    ['BIG-B', '4503599627370496', ['a']],
    ['FILL', '999999999999999999', ['b']],
  ]);
  const r = greedySolve(p);
  // BIG-A 比值 4503599627370496.5, BIG-B 比值 4503599627370496, 应先选 BIG-B
  assert.equal(r.steps[0].chosenId, 'BIG-B');
  assert.equal(r.status, 'complete');
});

test('平局规则: 比值相同先小成本, 再按编号字典序', () => {
  const p = problem(['a', 'b', 'c', 'd'], [
    ['T3', 2, ['c', 'd']],
    ['T1', 2, ['a', 'b']],
    ['T2', 2, ['a', 'c']],
    ['T0', 5, ['a', 'b']],
  ]);
  const r = greedySolve(p);
  // 第一轮 T1/T2/T3 比值均为 1, 成本相同, 按编号 T1 先
  assert.equal(r.steps[0].chosenId, 'T1');
  assert.equal(r.status, 'complete');
});

test('输入行序不影响选择结果', () => {
  const cands: [string, number, string[]][] = [
    ['A', 3, ['x', 'y']],
    ['B', 4, ['y', 'z']],
    ['C', 1, ['z']],
  ];
  const r1 = greedySolve(problem(['x', 'y', 'z'], cands));
  const r2 = greedySolve(problem(['z', 'y', 'x'], [...cands].reverse()));
  assert.deepEqual(r1.selectedIds, r2.selectedIds);
  assert.equal(r1.totalCost, r2.totalCost);
  assert.deepEqual(r1.steps.map((s) => s.chosenId), r2.steps.map((s) => s.chosenId));
});

test('空全集返回零成本空方案', () => {
  const r = greedySolve(problem([], [['A', 5, []]]));
  assert.equal(r.status, 'complete');
  assert.equal(r.totalCost, '0');
  assert.deepEqual(r.selectedIds, []);
});

test('空方案(无候选)且全集非空时报告缺项', () => {
  const r = greedySolve(problem(['a', 'b'], []));
  assert.equal(r.status, 'infeasible');
  assert.deepEqual(r.uncovered, ['a', 'b']);
});

test('孤立元素: 无法完整覆盖且列出具体缺项', () => {
  const r = greedySolve(problem(['a', 'b', 'iso'], [['A', 1, ['a', 'b']]]));
  assert.equal(r.status, 'infeasible');
  assert.deepEqual(r.uncovered, ['iso']);
  assert.deepEqual(r.selectedIds, ['A']);
});

test('每轮重新计算收益, 不做一次性排序', () => {
  // PKG-01 第一轮比值 8/4=2 优于 PKG-05 的 9/3=3? 8/4=2 < 3 是; 但 PKG-02/03/04 比值 2 平局成本4<8
  const p = problem(['a', 'b', 'c', 'd', 'e', 'f'], [
    ['PKG-01', 8, ['a', 'b', 'c', 'd']],
    ['PKG-02', 4, ['a', 'b']],
    ['PKG-03', 4, ['c', 'd']],
    ['PKG-04', 4, ['e', 'f']],
    ['PKG-05', 9, ['e', 'f', 'a']],
  ]);
  const r = greedySolve(p);
  assert.deepEqual(r.steps.map((s) => s.chosenId), ['PKG-02', 'PKG-03', 'PKG-04']);
  assert.equal(r.totalCost, '12');
  // 第二轮 PKG-01 的新增覆盖从 4 降为 2, 比值从 2 变为 4
  const round2 = r.steps[1].ratios.find((x) => x.id === 'PKG-01');
  assert.equal(round2?.newCount, 2);
});

test('贪心非最优小例: 穷举核验确认差距', () => {
  const p = problem(['E1', 'E2', 'E3', 'E4', 'E5', 'E6'], [
    ['S1', 3, ['E1', 'E2', 'E4', 'E5']],
    ['S2', 3, ['E1', 'E2', 'E3']],
    ['S3', 3, ['E4', 'E5', 'E6']],
  ]);
  const g = greedySolve(p);
  const e = exhaustiveSolve(p);
  assert.equal(g.totalCost, '9');
  assert.equal(e.totalCost, '6');
  assert.deepEqual(e.selectedIds, ['S2', 'S3']);
});

test('随机小规模: 穷举独立核对贪心结果的可行性与成本上界', () => {
  let seed = 42;
  const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let t = 0; t < 50; t++) {
    const u = Array.from({ length: 1 + Math.floor(rand() * 6) }, (_, i) => `e${i}`);
    const cands: [string, number, string[]][] = Array.from(
      { length: 1 + Math.floor(rand() * 6) },
      (_, i) => [
        `c${i}`,
        1 + Math.floor(rand() * 9),
        u.filter(() => rand() < 0.5),
      ],
    );
    const p = problem(u, cands);
    const g = greedySolve(p);
    const e = exhaustiveSolve(p);
    assert.equal(g.status, e.status);
    if (g.status === 'complete') {
      assert.ok(BigInt(g.totalCost) >= BigInt(e.totalCost), '贪心成本不应低于最优');
      // 独立核对贪心方案确实覆盖全集
      const v = verifyPlan(p, g.selectedIds);
      assert.equal(v.status, 'complete');
      assert.equal(v.totalCost, g.totalCost);
    } else {
      assert.ok(g.uncovered.length > 0, '失败报告必须列出缺项');
    }
  }
});

test('核验: 重复编号不重复覆盖或计费, 未知编号报错', () => {
  const p = problem(['a', 'b'], [
    ['A', 5, ['a']],
    ['B', 7, ['b']],
  ]);
  const v = verifyPlan(p, ['A', 'A', 'B']);
  assert.equal(v.status, 'complete');
  assert.equal(v.totalCost, '12');
  assert.deepEqual(v.duplicateIds, ['A']);
  assert.throws(() => verifyPlan(p, ['NOPE']), /未知的方案编号/);
});

test('校验: 重复编号/非法成本/全集外元素被拒绝, 清单去重有说明', () => {
  assert.throws(() => validateProblem({ universe: ['a'], candidates: [{ id: 'X', cost: 1, elements: ['a'] }, { id: 'X', cost: 2, elements: ['a'] }] }), (e: any) => e.code === 'DUPLICATE_PLAN_ID');
  assert.throws(() => validateProblem({ universe: ['a'], candidates: [{ id: 'X', cost: 0, elements: ['a'] }] }), (e: any) => e.code === 'INVALID_COST');
  assert.throws(() => validateProblem({ universe: ['a'], candidates: [{ id: 'X', cost: -3, elements: ['a'] }] }), (e: any) => e.code === 'INVALID_COST');
  assert.throws(() => validateProblem({ universe: ['a'], candidates: [{ id: 'X', cost: 1.5, elements: ['a'] }] }), (e: any) => e.code === 'INVALID_COST');
  assert.throws(() => validateProblem({ universe: ['a'], candidates: [{ id: 'X', cost: 1, elements: ['b'] }] }), (e: any) => e.code === 'UNKNOWN_ELEMENT');
  const { dedupNotes, problem: p } = validateProblem({ universe: ['a', 'b'], candidates: [{ id: 'X', cost: 1, elements: ['a', 'a', 'b'] }] });
  assert.deepEqual(dedupNotes, [{ id: 'X', removed: ['a'] }]);
  assert.deepEqual(p.candidates[0].elements, ['a', 'b']);
});

test('大小写敏感的元素标识', () => {
  assert.throws(() => validateProblem({ universe: ['Abc'], candidates: [{ id: 'X', cost: 1, elements: ['abc'] }] }), (e: any) => e.code === 'UNKNOWN_ELEMENT');
});
