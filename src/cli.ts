import * as fs from 'node:fs';
import * as path from 'node:path';
import { Store } from './store';
import { startServer } from './server';
import { renderReport } from './report';
import { ApiError } from './types';

export function defaultDataDir(): string {
  return process.env.COVER_DATA_DIR ?? path.join(process.cwd(), 'data');
}

function parseIds(s: string): string[] {
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}

function readJsonFile(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e: any) {
    if (e?.code === 'ENOENT') throw new ApiError('BAD_REQUEST', `文件不存在: ${file}`);
    throw new ApiError('INVALID_JSON', `文件不是合法 JSON: ${file}`);
  }
}

const USAGE = `用法: cover <命令> [参数]

命令:
  serve [--port N] [--data DIR]     启动 API 服务(端口缺省为 0, 自动选择空闲端口)
  import <file.json> [--name N]     导入输入, 生成/复用冻结版本
  list                              列出输入版本与结果
  run <inputId> [--exhaustive]      运行贪心(或穷举核验)求解
  explain <resultId>                打印逐步解释
  verify <inputId> <id1,id2,...>    独立核验给定方案集合
  compare <inputId> <id1,id2,...>   比较贪心结果与给定方案
  export <resultId> [--out file]    导出 Markdown 报告
  demo                              运行内置演示例子
`;

export async function runCli(argv: string[]): Promise<void> {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === 'help' || cmd === '--help') {
    console.log(USAGE);
    return;
  }
  const flag = (name: string): string | undefined => {
    const i = rest.indexOf(`--${name}`);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  const has = (name: string) => rest.includes(`--${name}`);
  const positional = rest.filter((a, i) => !a.startsWith('--') && rest[i - 1] !== '--port' && rest[i - 1] !== '--data' && rest[i - 1] !== '--name' && rest[i - 1] !== '--out');

  const store = new Store(flag('data') ?? defaultDataDir());
  try {
    switch (cmd) {
      case 'serve': {
        const port = flag('port') ? Number(flag('port')) : 0;
        if (!Number.isInteger(port) || port < 0 || port > 65535) {
          throw new ApiError('BAD_REQUEST', '端口必须是 0-65535 的整数(0 表示自动选择空闲端口)');
        }
        const server = await startServer(store, port);
        const addr = server.address();
        console.log(`API 服务已启动: http://localhost:${typeof addr === 'object' && addr ? addr.port : port}`);
        return; // 保持进程运行
      }
      case 'import': {
        const file = positional[0];
        if (!file) throw new ApiError('BAD_REQUEST', '缺少输入文件路径');
        const { record, isNew } = store.importInput(readJsonFile(file), flag('name'));
        console.log(JSON.stringify({ inputId: record.id, isNewVersion: isNew, dedupNotes: record.dedupNotes }, null, 2));
        return;
      }
      case 'list': {
        console.log(JSON.stringify({ inputs: store.listInputs(), results: store.listResults() }, null, 2));
        return;
      }
      case 'run': {
        const id = Number(positional[0]);
        const result = has('exhaustive') ? store.runExhaustive(id) : store.runGreedy(id);
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      case 'explain': {
        const result = store.getResult(Number(positional[0]));
        console.log(renderReport(store.getInput(result.inputId), result));
        return;
      }
      case 'verify': {
        const result = store.runVerify(Number(positional[0]), parseIds(positional[1] ?? ''));
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      case 'compare': {
        const inputId = Number(positional[0]);
        const greedy = store.runGreedy(inputId);
        const mine = store.runVerify(inputId, parseIds(positional[1] ?? ''));
        console.log(JSON.stringify({ greedy, mine }, null, 2));
        return;
      }
      case 'export': {
        const result = store.getResult(Number(positional[0]));
        const md = renderReport(store.getInput(result.inputId), result);
        const out = flag('out');
        if (out) {
          fs.writeFileSync(out, md, 'utf8');
          console.log(`已导出: ${out}`);
        } else {
          console.log(md);
        }
        return;
      }
      case 'demo': {
        const { runDemo } = await import('./demo');
        await runDemo(store);
        return;
      }
      default:
        console.error(`未知命令: ${cmd}\n${USAGE}`);
        process.exitCode = 2;
    }
  } finally {
    if (cmd !== 'serve') store.close();
  }
}

if (require.main === module) {
  runCli(process.argv.slice(2)).catch((e) => {
    if (e instanceof ApiError) {
      console.error(`错误 [${e.code}]: ${e.message}`);
      process.exitCode = 1;
    } else {
      console.error(e);
      process.exitCode = 1;
    }
  });
}
