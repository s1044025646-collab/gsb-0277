import { createServer, type Server } from "node:http";
import { errorBody } from "./errors.js";
import { greedyReportMarkdown } from "./report.js";
import type { CoverService } from "./service.js";
import type { GreedyResult } from "./types.js";

function parseId(s: string | undefined, name: string): number {
  const n = Number(s);
  if (!Number.isInteger(n) || n <= 0) {
    throw Object.assign(new Error(`${name} 必须是正整数`), { code: "BAD_REQUEST", status: 400 });
  }
  return n;
}

async function readBody(req: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return {};
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(text);
  } catch {
    throw Object.assign(new Error("请求体必须是合法 JSON"), { code: "BAD_REQUEST", status: 400 });
  }
}

/**
 * 启动 HTTP API。port 省略或为 0 时由系统分配空闲端口。
 */
export function startApi(service: CoverService, port = 0, host = "127.0.0.1"): Promise<{ server: Server; port: number }> {
  const server = createServer(async (req, res) => {
    const send = (status: number, body: unknown, contentType = "application/json; charset=utf-8") => {
      const text = contentType.includes("json") ? JSON.stringify(body, null, 2) : String(body);
      res.writeHead(status, { "content-type": contentType });
      res.end(text);
    };
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const parts = url.pathname.split("/").filter(Boolean);
      const method = req.method ?? "GET";
      if (method === "GET" && url.pathname === "/api/health") {
        return send(200, { ok: true });
      }
      if (method === "POST" && url.pathname === "/api/inputs") {
        return send(201, service.importInput(await readBody(req)));
      }
      if (method === "GET" && url.pathname === "/api/inputs") {
        return send(200, service.listVersions());
      }
      if (parts[0] === "api" && parts[1] === "inputs" && parts.length >= 3) {
        const versionId = parseId(parts[2], "versionId");
        if (method === "GET" && parts.length === 3) return send(200, service.getVersion(versionId));
        if (method === "POST" && parts[3] === "run") return send(200, service.runGreedy(versionId));
        if (method === "POST" && parts[3] === "verify") {
          const body = (await readBody(req)) as { selected?: unknown };
          return send(200, service.verify(versionId, body?.selected));
        }
        if (method === "POST" && parts[3] === "compare") {
          const body = (await readBody(req)) as { selected?: unknown };
          return send(200, service.compare(versionId, body?.selected));
        }
        if (method === "POST" && parts[3] === "exhaustive") {
          return send(200, service.exhaustive(versionId));
        }
      }
      if (method === "GET" && url.pathname === "/api/runs") {
        const v = url.searchParams.get("versionId");
        return send(200, service.listRuns(v === null ? undefined : parseId(v, "versionId")));
      }
      if (parts[0] === "api" && parts[1] === "runs" && parts.length >= 3) {
        const runId = parseId(parts[2], "runId");
        if (method === "GET" && parts.length === 3) return send(200, service.getRun(runId));
        if (method === "GET" && parts[3] === "report") {
          const run = service.getRun(runId);
          if (run.kind !== "greedy") {
            return send(400, { error: { code: "BAD_REQUEST", message: "仅贪心运行支持逐步报告导出" } });
          }
          const format = url.searchParams.get("format") ?? "json";
          if (format === "md" || format === "markdown") {
            return send(
              200,
              greedyReportMarkdown({ runId: run.runId, versionId: run.versionId, createdAt: run.createdAt, result: run.result as GreedyResult }),
              "text/markdown; charset=utf-8",
            );
          }
          return send(200, run);
        }
      }
      return send(404, { error: { code: "NOT_FOUND", message: `未匹配路由: ${method} ${url.pathname}` } });
    } catch (err) {
      const { status, body } = errorBody(err);
      return send(status, body);
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const addr = server.address();
      resolve({ server, port: typeof addr === "object" && addr ? addr.port : port });
    });
  });
}
