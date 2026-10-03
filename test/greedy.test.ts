import test from "node:test";
import assert from "node:assert/strict";
import { compareRatio, greedySolve } from "../src/greedy.js";
import { validateProblem } from "../src/validate.js";
import { exhaustiveSolve } from "../src/exhaustive.js";
import { verifySelection } from "../src/verify.js";
import { ApiError } from "../src/errors.js";

test("交叉相乘比较：不做小数舍入", () => {
  // 3/2 = 1.5 vs 4/3 ≈ 1.333，浮点直接除可能失真，交叉相乘精确
  assert.equal(compareRatio(3n, 2, 4n, 3), 1);
  assert.equal(compareRatio(4n, 3, 3n, 2), -1);
  assert.equal(compareRatio(6n, 4, 3n, 2), 0); // 等值比值
});

test("交叉相乘比较：超出 double 精度的大整数", () => {
  // 9007199254740993 无法被 double 精确表示
  const a = 9007199254740993n;
  const b = 9007199254740992n;
  assert.equal(compareRatio(a, 1, b, 1), 1);
  assert.equal(compareRatio(b, 1, a, 1), -1);
  // a/2 vs b/2 在浮点下相等，整数比较应区分
  assert.equal(compareRatio(a, 2, b, 2), 1);
});

test("大整数成本：总成本用 BigInt 累加", () => {
  const p = validateProblem({
    universe: ["x", "y"],
    candidates: [
      { id: "A", cost: "9007199254740993", elements: ["x"] },
      { id: "B", cost: "9007199254740993", elements: ["y"] },
    ],
  });
  const r = greedySolve(p);
  assert.equal(r.status, "complete");
  assert.equal(r.totalCost, "18014398509481986");
});

test("空全集：零成本空方案", () => {
  const p = validateProblem({ universe: [], candidates: [{ id: "A", cost: 5, elements: [] }] });
  const r = greedySolve(p);
  assert.equal(r.status, "complete");
  assert.deepEqual(r.selectedIds, []);
  assert.equal(r.totalCost, "0");
  assert.equal(r.steps.length, 0);
});

test("空方案集合核验：非空全集时失败并列出缺项", () => {
  const p = validateProblem({ universe: ["a"], candidates: [{ id: "A", cost: 1, elements: ["a"] }] });
  const v = verifySelection(p, []);
  assert.equal(v.ok, false);
  assert.deepEqual(v.uncovered, ["a"]);
  assert.equal(v.totalCost, "0");
});

test("孤立元素：无法完整覆盖并报告缺项", () => {
  const p = validateProblem({
    universe: ["a", "b", "iso"],
    candidates: [{ id: "A", cost: 1, elements: ["a", "b"] }],
  });
  const r = greedySolve(p);
  assert.equal(r.status, "incomplete");
  assert.deepEqual(r.uncovered, ["iso"]);
  assert.match(r.message, /iso/);
});

test("不同输入行序产生相同选择", () => {
  const mk = (order: number[]) => {
    const cs = [
      { id: "A", cost: 4, elements: ["u", "v"] },
      { id: "B", cost: 6, elements: ["u", "v", "w"] },
      { id: "C", cost: 6, elements: ["w", "z"] },
    ];
    return validateProblem({ universe: ["u", "v", "w", "z"], candidates: order.map((i) => cs[i]) });
  };
  const r1 = greedySolve(mk([0, 1, 2]));
  const r2 = greedySolve(mk([2, 1, 0]));
  assert.deepEqual(r1.selectedIds, r2.selectedIds);
  assert.equal(r1.totalCost, r2.totalCost);
});

test("平局规则：比值相同先小成本，再按编号序", () => {
  // A: 4/2=2, B: 6/3=2 → 成本小者 A 胜
  const p1 = validateProblem({
    universe: ["u", "v", "w"],
    candidates: [
      { id: "B", cost: 6, elements: ["u", "v", "w"] },
      { id: "A", cost: 4, elements: ["u", "v"] },
      { id: "C", cost: 10, elements: ["w"] },
    ],
  });
  const r1 = greedySolve(p1);
  assert.equal(r1.steps[0].chosenId, "A");
  // 同成本同比值 → 编号序小者胜
  const p2 = validateProblem({
    universe: ["u", "v"],
    candidates: [
      { id: "Z", cost: 2, elements: ["u"] },
      { id: "Y", cost: 2, elements: ["u"] },
      { id: "X", cost: 10, elements: ["v"] },
    ],
  });
  const r2 = greedySolve(p2);
  assert.equal(r2.steps[0].chosenId, "Y");
});

test("每轮重新计算收益，而非一次排队", () => {
  // 第一轮 BIG 比值最优，但选 SMALL 后 BIG 收益应重算
  const p = validateProblem({
    universe: ["a", "b", "c"],
    candidates: [
      { id: "BIG", cost: 5, elements: ["a", "b", "c"] },
      { id: "S1", cost: 2, elements: ["a"] },
      { id: "S2", cost: 2, elements: ["b"] },
      { id: "S3", cost: 2, elements: ["c"] },
    ],
  });
  const r = greedySolve(p);
  // 第一轮 BIG 比值 5/3≈1.67 < 2，选 BIG 后一轮结束
  assert.deepEqual(r.selectedIds, ["BIG"]);
  assert.equal(r.steps.length, 1);
  // 若 BIG 成本为 7：第一轮 S 系 2 < 7/3，选 S1；第二轮 BIG 新增仅剩 b,c，比值 7/2=3.5 > 2，仍选 S 系
  const p2 = validateProblem({
    universe: ["a", "b", "c"],
    candidates: [
      { id: "BIG", cost: 7, elements: ["a", "b", "c"] },
      { id: "S1", cost: 2, elements: ["a"] },
      { id: "S2", cost: 2, elements: ["b"] },
      { id: "S3", cost: 2, elements: ["c"] },
    ],
  });
  const r2 = greedySolve(p2);
  assert.deepEqual(r2.selectedIds.sort(), ["S1", "S2", "S3"]);
  assert.equal(r2.totalCost, "6");
});

test("贪心可劣于穷举最优（demo2 小例）", () => {
  const p = validateProblem({
    universe: ["CHK-A", "CHK-B", "CHK-C"],
    candidates: [
      { id: "PKG-PAIR", cost: 3, elements: ["CHK-A", "CHK-B"] },
      { id: "PKG-SOLO", cost: 2, elements: ["CHK-A"] },
      { id: "PKG-TAIL", cost: 4, elements: ["CHK-B", "CHK-C"] },
    ],
  });
  const g = greedySolve(p);
  const e = exhaustiveSolve(p);
  assert.equal(g.totalCost, "7");
  assert.equal(e.bestCost, "6");
  assert.ok(BigInt(g.totalCost) > BigInt(e.bestCost));
});

test("穷举核验：成功报告覆盖全集，失败报告不隐去缺项", () => {
  const p = validateProblem({
    universe: ["a", "b"],
    candidates: [
      { id: "A", cost: 1, elements: ["a"] },
      { id: "B", cost: 1, elements: ["b"] },
    ],
  });
  const e = exhaustiveSolve(p);
  assert.equal(e.feasible, true);
  assert.deepEqual(e.bestIds.sort(), ["A", "B"]);
  const g = greedySolve(p);
  assert.equal(g.status, "complete");
  assert.deepEqual(g.uncovered, []);
});

test("校验拒绝：全集外元素 / 重复编号 / 非法成本", () => {
  assert.throws(
    () => validateProblem({ universe: ["a"], candidates: [{ id: "A", cost: 1, elements: ["b"] }] }),
    (e) => e instanceof ApiError && e.code === "ELEMENT_NOT_IN_UNIVERSE",
  );
  assert.throws(
    () =>
      validateProblem({
        universe: ["a"],
        candidates: [
          { id: "A", cost: 1, elements: ["a"] },
          { id: "A", cost: 2, elements: ["a"] },
        ],
      }),
    (e) => e instanceof ApiError && e.code === "DUPLICATE_CANDIDATE_ID",
  );
  for (const bad of [0, -3, 1.5, "x", "0", null]) {
    assert.throws(
      () => validateProblem({ universe: ["a"], candidates: [{ id: "A", cost: bad, elements: ["a"] }] }),
      (e) => e instanceof ApiError && e.code === "INVALID_COST",
      `cost=${bad}`,
    );
  }
});

test("清单内重复元素按集合处理并记录去重结果", () => {
  const p = validateProblem({
    universe: ["a", "b"],
    candidates: [{ id: "A", cost: 2, elements: ["a", "a", "b", "a"] }],
  });
  assert.equal(p.candidates[0].elements.size, 2);
  assert.deepEqual(p.candidates[0].duplicatesRemoved, ["a", "a"]);
});

test("核验：重复选中不重复计费，未知编号报错", () => {
  const p = validateProblem({
    universe: ["a"],
    candidates: [{ id: "A", cost: 5, elements: ["a"] }],
  });
  const v = verifySelection(p, ["A", "A", "A"]);
  assert.equal(v.ok, true);
  assert.equal(v.totalCost, "5");
  assert.deepEqual(v.duplicatesIgnored, ["A", "A"]);
  assert.throws(
    () => verifySelection(p, ["NOPE"]),
    (e) => e instanceof ApiError && e.code === "UNKNOWN_CANDIDATE_ID",
  );
});
