// 演示脚本：通过 CLI 走一遍 导入 -> 运行 -> 解释 -> 核验 -> 比较 -> 穷举 -> 导出。
// 运行前请先 npm run build。使用独立演示数据目录，不影响正式数据。
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";

const cli = path.join(process.cwd(), "dist", "src", "cli.js");
const dataDir = path.join(process.cwd(), "data-demo");
rmSync(dataDir, { recursive: true, force: true });

function run(args) {
  console.log(`\n$ cli ${args.join(" ")}`);
  const out = execFileSync(process.execPath, [cli, ...args], {
    env: { ...process.env, COVER_SELECT_DATA_DIR: dataDir },
    encoding: "utf8",
  });
  console.log(out.trim());
  return out;
}

console.log("== 示例1：重叠 / 冗余 / 比值平局 ==");
run(["import", "examples/demo1-overlap-tie.json"]);
run(["run", "1"]);
run(["verify", "1", "PKG-ALPHA", "PKG-GAMMA", "PKG-GAMMA"]);
run(["compare", "1", "PKG-BETA", "PKG-GAMMA"]);
run(["exhaustive", "1"]);
run(["export", "1", "--md", path.join(dataDir, "report-1.md")]);

console.log("\n== 示例2：贪心成本高于穷举最优 ==");
run(["import", "examples/demo2-greedy-not-optimal.json"]);
run(["run", "2"]);
run(["exhaustive", "2"]);

console.log("\n== 示例3：孤立元素导致无法完整覆盖 ==");
run(["import", "examples/demo3-isolated.json"]);
run(["run", "3"]);

console.log("\n== 示例4：空全集 -> 零成本空方案 ==");
run(["import", "examples/demo4-empty-universe.json"]);
run(["run", "4"]);

console.log(`\n演示完成，数据目录: ${dataDir}`);
