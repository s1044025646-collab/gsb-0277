import * as http from 'node:http';
import { Store } from './store';
import { ApiError } from './types';
import { renderReport } from './report';

function send(res: http.ServerResponse, status: number, body: unknown, contentType = 'application/json; charset=utf-8') {
  const data = contentType.startsWith('application/json') ? JSON.stringify(body, null, 2) : String(body);
  res.writeHead(status, { 'Content-Type': contentType });
  res.end(data);
}

async function readBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ApiError('INVALID_JSON', '请求体不是合法 JSON');
  }
}

export function createServer(store: Store): http.Server {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const parts = url.pathname.split('/').filter(Boolean);
      const method = req.method ?? 'GET';
      const body = method === 'POST' || method === 'PUT' ? await readBody(req) : undefined;

      // POST /api/inputs  导入输入
      if (method === 'POST' && parts.join('/') === 'api/inputs') {
        const { record, isNew } = store.importInput(body, (body as any)?.name);
        return send(res, isNew ? 201 : 200, { input: record, isNewVersion: isNew });
      }
      // GET /api/inputs
      if (method === 'GET' && parts.join('/') === 'api/inputs') {
        return send(res, 200, { inputs: store.listInputs() });
      }
      if (parts[0] === 'api' && parts[1] === 'inputs' && parts[2]) {
        const inputId = Number(parts[2]);
        if (!Number.isInteger(inputId)) throw new ApiError('BAD_REQUEST', '输入版本 id 必须是整数');
        // GET /api/inputs/:id
        if (method === 'GET' && parts.length === 3) {
          return send(res, 200, { input: store.getInput(inputId) });
        }
        // POST /api/inputs/:id/solve  (?mode=exhaustive)
        if (method === 'POST' && parts[3] === 'solve' && parts.length === 4) {
          const mode = url.searchParams.get('mode') ?? (body as any)?.mode ?? 'greedy';
          const result = mode === 'exhaustive' ? store.runExhaustive(inputId) : store.runGreedy(inputId);
          return send(res, 201, { result });
        }
        // POST /api/inputs/:id/verify  { planIds: [] }
        if (method === 'POST' && parts[3] === 'verify' && parts.length === 4) {
          return send(res, 201, { result: store.runVerify(inputId, (body as any)?.planIds) });
        }
        // POST /api/inputs/:id/compare  { planIds: [] }  贪心 vs 用户方案
        if (method === 'POST' && parts[3] === 'compare' && parts.length === 4) {
          const greedy = store.runGreedy(inputId);
          const mine = store.runVerify(inputId, (body as any)?.planIds);
          const g = greedy.payload as any;
          const m = mine.payload as any;
          return send(res, 201, {
            greedy,
            mine,
            comparison: {
              greedyCost: g.totalCost,
              myCost: m.totalCost,
              greedyComplete: g.status === 'complete',
              mineComplete: m.status === 'complete',
              costDiff: (BigInt(m.totalCost) - BigInt(g.totalCost)).toString(),
            },
          });
        }
      }
      // GET /api/results  /  GET /api/results/:id  /  GET /api/results/:id/export
      if (method === 'GET' && parts[0] === 'api' && parts[1] === 'results') {
        if (parts.length === 2) {
          const inputId = url.searchParams.get('inputId');
          return send(res, 200, { results: store.listResults(inputId ? Number(inputId) : undefined) });
        }
        const resultId = Number(parts[2]);
        if (!Number.isInteger(resultId)) throw new ApiError('BAD_REQUEST', '结果 id 必须是整数');
        const result = store.getResult(resultId);
        if (parts[3] === 'export') {
          const md = renderReport(store.getInput(result.inputId), result);
          return send(res, 200, md, 'text/markdown; charset=utf-8');
        }
        return send(res, 200, { result });
      }
      throw new ApiError('NOT_FOUND', `路由不存在: ${method} ${url.pathname}`, undefined, 404);
    } catch (err) {
      if (err instanceof ApiError) {
        return send(res, err.httpStatus, { error: { code: err.code, message: err.message, details: err.details } });
      }
      send(res, 500, { error: { code: 'INTERNAL', message: String(err) } });
    }
  });
}

export function startServer(store: Store, port: number): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const server = createServer(store);
    server.on('error', reject);
    server.listen(port, () => {
      resolve(server);
    });
  });
}
