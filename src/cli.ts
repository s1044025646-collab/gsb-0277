#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { openDb } from "./db.js";
import { CoverService } from "./service.js";
import { startApi } from "./api.js";
import { greedyReportMarkdown } from "./report.js";
import { errorBody } from "./errors.js";
import type { GreedyResult } from "./types.js";

const USAGE = `用法: node dist/src/cli.js <命令> [参数]

命令:
  serve [--port N]                 启动 HTTP API（默认自动选择空闲端口）
  import <file.json>               导入输入（全集 + 候选方案），内容变化产生新版本
  versions                         列出全部输入版本
  run <versionId>                  对指定版本运行贪心选择
  explain <runId>                  查看贪心逐步解释（JSON）
  verify <versionId> <id...>       独立核验给定方案编号集合
  compare <versionId> <id...>      比较给定方案与贪心结果
  exhaustive <versionId>           小规模穷举核验（仅测试/演示）
  runs [versionId]                 列出历史运行记录
  export <runId> [--md <file>]     导出报告（JSON 到 stdout，或 Markdown 到文件）

环境变量:
  COVER_SELECT_DATA_DIR            数据目录（默认 ./data）
`;

function out(v: unknown): void {
  process.stdout.write(JSON.stringify(v, null, 2) + "\n");
}

async function main(argv: string[]): Promise<number> {
  const [cmd, ...args] = argv;
  const service = new CoverService(openDb());

  switch (cmd) {
    case "serve": {
      const pi = args.indexOf("--port");
      const port = pi >= 0 ? Number(args[pi + 1]) : 0;
      if (!Number.isInteger(port) || port < 0 || port > 65535) {
        process.stderr.write("--port 必须是 0-65535 的整数（0 表示自动选择空闲端口）\n");
        return 2;
      }
      const { port: actual } = await startApi(service, port);
      process.stdout.write(`API 已启动: http://127.0.0.1:${actual}/api/health\n`);
      return 0;
    }
    case "import": {
      const file = args[0];
      if (!file) throw new Error("缺少输入文件路径");
      const raw = JSON.parse(readFileSync(file, "utf8"));
      const r = service.importInput(raw);
      out(r);
      process.stdout.write(r.created ? `已创建新版本 ${r.versionId}\n` : `输入未变化，复用版本 ${r.versionId}\n`);
      return 0;
    }
    case "versions":
      out(service.listVersions());
      return 0;
    case "run":
      out(service.runGreedy(Number(args[0])));
      return 0;
    case "explain":
      out(service.getRun(Number(args[0])));
      return 0;
    case "verify":
      out(service.verify(Number(args[0]), args.slice(1)));
      return 0;
    case "compare":
      out(service.compare(Number(args[0]), args.slice(1)));
      return 0;
    case "exhaustive":
      out(service.exhaustive(Number(args[0])));
      return 0;
    case "runs":
      out(service.listRuns(args[0] === undefined ? undefined : Number(args[0])));
      return 0;
    case "export": {
      const run = service.getRun(Number(args[0]));
      const mi = args.indexOf("--md");
      if (mi >= 0) {
        if (run.kind !== "greedy") throw new Error("仅贪心运行支持 Markdown 报告");
        const file = args[mi + 1];
        if (!file) throw new Error("--md 需要输出文件路径");
        writeFileSync(
          file,
          greedyReportMarkdown({ runId: run.runId, versionId: run.versionId, createdAt: run.createdAt, result: run.result as GreedyResult }),
          "utf8",
        );
        process.stdout.write(`已导出 Markdown 报告到 ${file}\n`);
      } else {
        out(run);
      }
      return 0;
    }
    default:
      process.stderr.write(USAGE);
      return cmd === undefined || cmd === "help" || cmd === "--help" ? 0 : 2;
  }
}

main(process.argv.slice(2))
  .then((code) => {
    if (process.argv[2] !== "serve") process.exit(code);
  })
  .catch((err) => {
    const { status, body } = errorBody(err);
    process.stderr.write(JSON.stringify(body) + `\n(exit ${status === 404 ? 4 : 1})\n`);
    process.exit(1);
  });
