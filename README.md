# cover-select：加权集合覆盖贪心选择与覆盖核验后端

一个纯本地运行的 Windows 后端（TypeScript + Node.js + SQLite），提供 HTTP API 与 CLI。
输入需要覆盖的元素全集和若干带唯一编号、正整数成本的候选方案，输出一组选择及每一步的解释。
演示数据使用虚构的检查项（`CHK-*`）与服务包（`PKG-*`），不绑定任何真实业务。

## 运行环境

- Windows 本地，Node.js >= 22.5（使用内置 `node:sqlite`，无原生编译依赖）
- 不需要 Docker / WSL / 付费服务 / 外部在线 API

## 快速开始

```powershell
npm install        # 安装 devDependencies（typescript、@types/node）
npm run build      # 编译 TypeScript 到 dist/
npm test           # 构建并运行全部自动化测试
npm run demo       # 运行演示（导入 -> 运行 -> 核验 -> 比较 -> 穷举 -> 导出）
npm start          # 启动 HTTP API（默认自动选择空闲端口）
```

CLI 直接使用：`node dist/src/cli.js <命令>`，或 `npm run cli -- <命令>`。

数据目录默认为项目内 `./data`（演示用 `./data-demo`），可用环境变量 `COVER_SELECT_DATA_DIR` 覆盖。

## 算法说明（保证范围与限制）

实现的是**确定性加权集合覆盖贪心**（算法版本 `greedy-v1`）：

- 每轮只考虑能覆盖至少一个尚未覆盖元素的候选，选择 `成本 / 本轮新增覆盖数` 最小者；
- 每轮结束后更新未覆盖集合，并**重新计算**所有剩余候选的收益（不是第一轮排一次队就依次取）；
- 比值比较使用整数交叉相乘（`a.cost * b.gain ? b.cost * a.gain`，BigInt 运算），
  **不做小数舍入**，大整数成本不会失真；
- 比值相同时，先取成本较小者，再按方案编号字符串序决定，规则固定、结果确定；
- 已选中的方案不重复参与、不重复收费。

**限制（重要）**：

- 贪心输出的是**可解释的可行解，不保证全局成本最低**。
  `examples/demo2-greedy-not-optimal.json` 演示了贪心成本 7 高于穷举最优 6 的真实小例；
- 不提供多重覆盖、互斥方案、预算约束等扩展；
- 穷举核验（`exhaustive`）仅用于小规模测试/演示（候选数 <= 22），正式求解不调用外部优化器；
- 经典理论保证：贪心对集合覆盖的近似比为 H(d)（d 为最大集合大小的调和数），仅作参考。

## 输入格式与校验

```json
{
  "universe": ["CHK-01", "CHK-02"],
  "candidates": [
    { "id": "PKG-ALPHA", "cost": 4, "elements": ["CHK-01", "CHK-02"] }
  ]
}
```

- 元素为**区分大小写**的非空字符串；全集与清单内重复按集合处理，清单去重结果在 `duplicatesRemoved` 中说明；
- 成本必须为正整数，可用 number（安全整数）或十进制字符串（支持超出 double 精度的大整数）；
- 以下情况整批拒绝，不产生任何版本：
  - `ELEMENT_NOT_IN_UNIVERSE` 引用全集外元素
  - `DUPLICATE_CANDIDATE_ID` 方案编号重复
  - `INVALID_COST` 非法成本（0、负数、小数、非数字）
  - `INVALID_INPUT` / `INVALID_ELEMENT` / `INVALID_UNIVERSE` 结构非法
- 核验相关错误：`UNKNOWN_CANDIDATE_ID`（未知编号）、`NOT_FOUND`（版本/运行不存在）、
  `EXHAUSTIVE_TOO_LARGE`（穷举超限）。

## 版本冻结与历史

- 每次导入对规范化后的输入（全集、候选、算法版本）计算 SHA-256；
  内容相同复用旧版本，**任何修改都会产生新版本**；
- 运行结果（含每轮比值、成本）持久化在 SQLite 中，报告只引用**冻结版本**的数据，
  后续修改方案成本不会影响历史报告；可随时按原始版本 ID 复算。

## HTTP API

`npm start` 启动，默认监听 `127.0.0.1` 并自动选择空闲端口（`--port N` 可指定）。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 |
| POST | `/api/inputs` | 导入输入，返回 `versionId` |
| GET | `/api/inputs` | 列出全部输入版本 |
| GET | `/api/inputs/:id` | 查看冻结的输入版本 |
| POST | `/api/inputs/:id/run` | 运行贪心选择（含逐步解释） |
| POST | `/api/inputs/:id/verify` | 核验 `{ "selected": ["PKG-A", ...] }` |
| POST | `/api/inputs/:id/compare` | 比较用户方案与贪心结果 |
| POST | `/api/inputs/:id/exhaustive` | 小规模穷举核验（仅演示/测试） |
| GET | `/api/runs?versionId=` | 列出历史运行 |
| GET | `/api/runs/:id` | 查看历史运行结果 |
| GET | `/api/runs/:id/report?format=md` | 导出报告（`md` 或 `json`） |

错误响应统一为 `{ "error": { "code", "message", "details" } }`。

## CLI

```
node dist/src/cli.js serve [--port N]            启动 API（默认自动选空闲端口）
node dist/src/cli.js import <file.json>          导入输入
node dist/src/cli.js versions                    列出输入版本
node dist/src/cli.js run <versionId>             运行贪心选择
node dist/src/cli.js explain <runId>             查看逐步解释
node dist/src/cli.js verify <versionId> <id...>  独立核验方案集合
node dist/src/cli.js compare <versionId> <id...> 与贪心结果比较
node dist/src/cli.js exhaustive <versionId>      小规模穷举核验
node dist/src/cli.js runs [versionId]            列出历史运行
node dist/src/cli.js export <runId> [--md file]  导出报告
```

## 示例数据

- `examples/demo1-overlap-tie.json`：重叠、冗余方案、清单内重复元素、比值平局
  （第 1 轮 `PKG-ALPHA` 4/2 与 `PKG-BETA` 6/3 平局，按较小成本选 ALPHA；
  第 2 轮 BETA 新增覆盖降为 1、比值变为 6/1，GAMMA 以 6/2 胜出）；
- `examples/demo2-greedy-not-optimal.json`：贪心总成本 7，穷举最优 6；
- `examples/demo3-isolated.json`：孤立元素 `CHK-ISO` 无任何方案覆盖，返回无法完整覆盖及缺项；
- `examples/demo4-empty-universe.json`：空全集，结果为零成本空方案。

## 测试

`npm test` 覆盖：交叉乘法比较（含超出 double 精度的大整数）、大整数成本累加、
空方案、空全集、无解缺项、不同输入行序一致性、固定平局规则、逐轮收益重算、
穷举独立核对、批量导入失败、重启后读取冻结报告、HTTP 端到端。

## 目录结构

```
src/        TypeScript 源码（greedy / verify / exhaustive / service / api / cli）
test/       node:test 测试
examples/   演示输入
scripts/    演示脚本
data/       默认 SQLite 数据目录（运行时生成）
```
