# 加权集合覆盖贪心选择与覆盖核验服务

本项目是一个 **Windows 本地可运行** 的纯后端服务（TypeScript + Node.js + SQLite），
演示用虚构的「检查项 / 服务包」数据，不绑定任何真实采购或排班业务。

- 输入：需要覆盖的元素全集（区分大小写的字符串标识）+ 多个候选方案（唯一编号、正整数成本、覆盖元素清单）
- 输出：一组选中方案、每一步选择的解释、累计成本、最终未覆盖元素
- 只提供 HTTP API 与 CLI，无前端；不依赖 Docker、WSL、付费服务或外部在线 API

## 环境要求

- Node.js ≥ 22.5（使用内置 `node:sqlite`，无需编译原生模块；开发环境为 Node 25）
- Windows 本地运行（其他平台理论上亦可）

## 快速开始

```powershell
npm install        # 安装开发依赖(typescript, @types/node)
npm run build      # 编译到 dist/
npm test           # 构建并运行全部自动化测试
npm start          # 启动 API 服务(默认端口 0 = 自动选择空闲端口)
npm run demo       # 运行内置演示(重叠/冗余/孤立元素/平局/贪心非最优)
```

CLI 直接调用：`node dist/src/cli.js <命令>`（见 `node dist/src/cli.js help`）。

## 算法说明（保证范围与限制）

核心是自研的 **确定性加权集合覆盖贪心**（`greedy-v1`）：

1. 每轮只考虑能覆盖至少一个尚未覆盖元素的候选方案；
2. 选择「成本 ÷ 本轮新增覆盖数量」最小者，**每轮重新计算**所有候选的收益，不做一次性排序；
3. 比值比较使用 **整数交叉相乘**（`a.cost * b.new < b.cost * a.new`，BigInt 实现），
   不经过浮点舍入，支持超出 double 精度的大整数成本；
4. 比值相同先按较小成本，再按方案编号字典序（固定次序）；
5. 已选中的方案不再参与后续轮次，不重复收费。

**重要限制**：

- 贪心得到的是 **可解释的可行解，不保证全局成本最低**（理论保证为 ln(n) 近似比）。
  内置演示 3 给出了一个贪心成本 9 高于穷举最优 6 的真实小例。
- 穷举核验（`exhaustive-v1`）仅用于 ≤22 个候选的小规模测试/演示，正式求解不调用任何外部优化器。
- 不支持多重覆盖需求、互斥方案、预算约束等扩展。
- 空全集的结果是零成本空方案；存在未覆盖元素但所有剩余候选都无新增覆盖时，
  返回「无法完整覆盖」并列出具体缺项。

## 输入校验与错误码

导入时拒绝：重复方案编号（`DUPLICATE_PLAN_ID`）、非正整数成本（`INVALID_COST`）、
引用全集外元素（`UNKNOWN_ELEMENT`）、结构非法（`VALIDATION_ERROR`）等。
清单内重复元素按集合处理，并在导入响应的 `dedupNotes` 中说明去重结果。
核验时引用未知编号返回 `UNKNOWN_PLAN_ID`。全部错误以
`{ "error": { "code", "message", "details?" } }` 形式返回。

## 版本冻结

- 每次导入按「全集 + 候选 + 算法版本」计算 SHA-256 哈希：内容相同复用已有版本，修改后产生新版本。
- SQLite（项目内 `data/cover.db`，可用 `--data` 或环境变量 `COVER_DATA_DIR` 更换）冻结保存
  全集、候选（含成本快照）与算法版本；历史结果可随时查看或按原始版本复算，
  报告只引用冻结数据，不受后续输入修改影响。

## HTTP API

默认端口 0（自动选择空闲端口），可用 `--port` 指定。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/inputs` | 导入输入，返回 `inputId` 与 `dedupNotes` |
| GET | `/api/inputs` / `/api/inputs/:id` | 列出 / 查看冻结输入版本 |
| POST | `/api/inputs/:id/solve` | 运行贪心求解（`?mode=exhaustive` 为穷举核验） |
| POST | `/api/inputs/:id/verify` | 独立核验 `{ "planIds": [...] }`（重复编号不重复计费） |
| POST | `/api/inputs/:id/compare` | 比较贪心结果与给定方案集合 |
| GET | `/api/results` / `/api/results/:id` | 查看历史结果（含逐步解释） |
| GET | `/api/results/:id/export` | 导出 Markdown 报告 |

## CLI

```
cover serve [--port N] [--data DIR]     启动 API 服务
cover import <file.json> [--name N]     导入输入
cover list                              列出输入版本与结果
cover run <inputId> [--exhaustive]      运行求解
cover explain <resultId>                打印逐步解释
cover verify <inputId> <id1,id2,...>    独立核验
cover compare <inputId> <id1,id2,...>   比较贪心与给定方案
cover export <resultId> [--out file]    导出 Markdown 报告
cover demo                              运行内置演示
```

示例输入见 `examples/`：`overlap.json`（重叠/冗余/平局）、`isolated.json`（孤立元素）、
`greedy-gap.json`（贪心劣于穷举最优）、`invalid-*.json`（非法输入示例）。

## 测试

`npm test` 覆盖：交叉乘法比较、大整数成本、空方案、空全集、无解缺项、输入行序不变性、
固定平局规则、随机小规模穷举交叉核对、重复编号核验、批量导入失败、重启后读取冻结报告、
HTTP API 端到端。

## 已知限制

- `node:sqlite` 在 Node 25 仍为实验特性（启动时有 ExperimentalWarning），API 可能随 Node 版本变化。
- 服务为单进程本地服务，无鉴权，请勿暴露到不可信网络。
