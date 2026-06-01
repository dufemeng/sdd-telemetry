import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';

const KB_ROOT = process.env.KNOWLEDGE_BASE_ROOT || '/tmp/mock-kb';

const DB = mysql.createPool({
  host: process.env.MYSQL_HOST ?? '127.0.0.1',
  port: Number(process.env.MYSQL_PORT ?? 3306),
  user: process.env.MYSQL_USER ?? 'sdd-telemetry',
  password: process.env.MYSQL_PASSWORD ?? 'sdd-telemetry',
  database: process.env.MYSQL_DATABASE ?? 'sdd-telemetry',
});

const sha = (...parts: string[]) => crypto.createHash('sha256').update(parts.join(':')).digest('hex');

const NOW = Date.now();
const DAY = 86_400_000;

function randomUser() {
  const users = MOCK_USERS;
  return users[Math.floor(Math.random() * users.length)];
}
function randomPast(days: number): Date {
  return new Date(NOW - Math.floor(Math.random() * days * DAY));
}
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

interface MockUser {
  id: number;
  userKey: string;
  userName: string;
  wikiRootPath: string;
}
const MOCK_USERS: MockUser[] = [
  { id: 900_001, userKey: sha('mock-user', 'zhangsan'), userName: '张三', wikiRootPath: '/Users/zhangsan/projects/bk-fe-knowledge-trade' },
  { id: 900_002, userKey: sha('mock-user', 'lisi'),     userName: '李四', wikiRootPath: '/Users/lisi/projects/bk-fe-knowledge-trade' },
  { id: 900_003, userKey: sha('mock-user', 'wangwu'),   userName: '王五', wikiRootPath: '/Users/wangwu/projects/bk-fe-knowledge-loan' },
  { id: 900_004, userKey: sha('mock-user', 'zhaoliu'),  userName: '赵六', wikiRootPath: '/Users/zhaoliu/projects/bk-fe-knowledge-wealth' },
  { id: 900_005, userKey: sha('mock-user', 'sunqi'),    userName: '孙七', wikiRootPath: '/Users/sunqi/projects/bk-fe-knowledge-trade' },
  { id: 900_006, userKey: sha('mock-user', 'zhouba'),   userName: '周八', wikiRootPath: '/Users/zhouba/projects/bk-fe-knowledge-loan' },
  { id: 900_007, userKey: sha('mock-user', 'wujiu'),    userName: '吴九', wikiRootPath: '/Users/wujiu/projects/bk-fe-knowledge-trade' },
  { id: 900_008, userKey: sha('mock-user', 'zhengshi'), userName: '郑十', wikiRootPath: '/Users/zhengshi/projects/bk-fe-knowledge-wealth' },
];

interface MockWorkItem {
  id: number;
  workItemKey: string;
  repo: string;
  domain: string;
  slug: string;
}
const MOCK_WORK_ITEMS: MockWorkItem[] = [
  { id: 900_001, workItemKey: sha('mock-wi', 'trade', '2026-04-10-unfreeze-component'), repo: 'trade', domain: 'cashier',      slug: '2026-04-10-unfreeze-component' },
  { id: 900_002, workItemKey: sha('mock-wi', 'trade', '2026-03-22-batch-payout'),        repo: 'trade', domain: 'cashier',      slug: '2026-03-22-batch-payout' },
  { id: 900_003, workItemKey: sha('mock-wi', 'trade', '2026-03-05-refund-flow'),          repo: 'trade', domain: 'cashier',      slug: '2026-03-05-refund-flow' },
  { id: 900_004, workItemKey: sha('mock-wi', 'trade', '2026-02-20-settlement-t1'),        repo: 'trade', domain: 'settlement',   slug: '2026-02-20-settlement-t1' },
  { id: 900_005, workItemKey: sha('mock-wi', 'trade', '2026-04-01-market-data-cache'),    repo: 'trade', domain: 'market-data',  slug: '2026-04-01-market-data-cache' },
  { id: 900_006, workItemKey: sha('mock-wi', 'trade', '2026-03-15-recon-auto'),           repo: 'trade', domain: 'reconciliation', slug: '2026-03-15-recon-auto' },
  { id: 900_007, workItemKey: sha('mock-wi', 'trade', '2026-04-20-algo-trading'),         repo: 'trade', domain: 'trade-core',   slug: '2026-04-20-algo-trading' },
  { id: 900_008, workItemKey: sha('mock-wi', 'trade', '2026-02-10-clearing-margin'),      repo: 'trade', domain: 'clearing',     slug: '2026-02-10-clearing-margin' },
  { id: 900_009, workItemKey: sha('mock-wi', 'loan', '2026-04-05-credit-ai'),             repo: 'loan',  domain: 'credit-review', slug: '2026-04-05-credit-ai' },
  { id: 900_010, workItemKey: sha('mock-wi', 'loan', '2026-03-18-risk-policy-v2'),        repo: 'loan',  domain: 'risk-control',  slug: '2026-03-18-risk-policy-v2' },
  { id: 900_011, workItemKey: sha('mock-wi', 'loan', '2026-02-28-flexible-repay'),        repo: 'loan',  domain: 'loan-mgmt',    slug: '2026-02-28-flexible-repay' },
  { id: 900_012, workItemKey: sha('mock-wi', 'loan', '2026-04-12-auto-collection'),       repo: 'loan',  domain: 'collection',   slug: '2026-04-12-auto-collection' },
  { id: 900_013, workItemKey: sha('mock-wi', 'wealth', '2026-03-10-esg-portfolio'),       repo: 'wealth', domain: 'portfolio',   slug: '2026-03-10-esg-portfolio' },
  { id: 900_014, workItemKey: sha('mock-wi', 'wealth', '2026-04-15-robo-advisor'),        repo: 'wealth', domain: 'advisor',     slug: '2026-04-15-robo-advisor' },
  { id: 900_015, workItemKey: sha('mock-wi', 'wealth', '2026-02-25-index-fund'),          repo: 'wealth', domain: 'fund-ops',    slug: '2026-02-25-index-fund' },
];

interface FileDef {
  repo: string;
  domain: string;
  relativePath: string;
  isDead: boolean;
  isNew: boolean;
  recallWeight: number;
}

function scanMockKB(): FileDef[] {
  const files: FileDef[] = [];
  const now = Date.now();
  const graceDays = 30;

  for (const repo of ['trade', 'loan', 'wealth']) {
    const repoDir = path.join(KB_ROOT, `bk-fe-knowledge-${repo}`);
    if (!fs.existsSync(repoDir)) continue;
    walk(repoDir, repoDir, repo, files, now, graceDays);
  }
  return files;
}

function walk(dir: string, repoRoot: string, repo: string, out: FileDef[], now: number, graceDays: number) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(full, repoRoot, repo, out, now, graceDays); continue; }
    if (!entry.name.toLowerCase().endsWith('.md')) continue;
    const rel = path.relative(repoRoot, full).split(path.sep).join('/');
    const seg = rel.split('/');
    const domain = seg[0]?.startsWith('domain-') ? seg[0]!.slice('domain-'.length) : null;
    const stat = fs.statSync(full);
    const ageDays = (now - stat.mtimeMs) / DAY;
    const isDead = ageDays > graceDays;
    const isNewFile = rel.includes('/new-') || rel.includes('/new_');
    const hasZeroRecalls = isDead || isNewFile;
    const hotThreshold = Math.random();
    let recallWeight: number;
    if (hasZeroRecalls) {
      recallWeight = 0;
    } else if (hotThreshold < 0.06) {
      recallWeight = 150 + Math.random() * 250;
    } else if (hotThreshold < 0.18) {
      recallWeight = 30 + Math.random() * 80;
    } else if (hotThreshold < 0.40) {
      recallWeight = 5 + Math.random() * 20;
    } else {
      recallWeight = 1 + Math.random() * 4;
    }
    out.push({
      repo,
      domain: domain ?? '(root)',
      relativePath: rel,
      isDead,
      isNew: isNewFile,
      recallWeight,
    });
  }
}

async function seed() {
  console.log('扫描 mock KB…');
  const files = scanMockKB();
  console.log(`  找到 ${files.length} 篇 .md 文件`);

  const conn = await DB.getConnection();
  try {
    await conn.beginTransaction();

    // 1. 清理旧 mock 数据
    console.log('清理旧 mock 数据…');
    await conn.execute(`DELETE FROM sdd_wiki_recalls WHERE recall_key LIKE 'mock-%'`);
    await conn.execute(`DELETE FROM sdd_users WHERE user_key LIKE '${sha('mock-user', '').slice(0, 10)}%'`);
    for (const u of MOCK_USERS) {
      await conn.execute(`DELETE FROM sdd_users WHERE id = ?`, [u.id]);
    }
    for (const w of MOCK_WORK_ITEMS) {
      await conn.execute(`DELETE FROM sdd_work_items WHERE id = ?`, [w.id]);
    }

    // 2. 插入 mock users
    console.log('插入 mock 用户…');
    for (const u of MOCK_USERS) {
      await conn.execute(
        `INSERT INTO sdd_users (id, user_key, user_name, wiki_root_path, first_seen_at, last_seen_at, gmt_create, gmt_modified)
         VALUES (?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL 90 DAY), NOW(), NOW(), NOW())
         ON DUPLICATE KEY UPDATE user_name=VALUES(user_name), wiki_root_path=VALUES(wiki_root_path)`,
        [u.id, u.userKey, u.userName, u.wikiRootPath],
      );
    }

    // 3. 插入 mock work items
    console.log('插入 mock 需求…');
    for (const w of MOCK_WORK_ITEMS) {
      const repoName = w.repo === 'trade' ? 'bk-fe-sdd-trade' : w.repo === 'loan' ? 'bk-fe-sdd-loan' : 'bk-fe-sdd-wealth';
      await conn.execute(
        `INSERT INTO sdd_work_items (id, work_item_key, requirements_repo_name, business_domain, work_item_slug, relative_dir, first_seen_at, last_seen_at, gmt_create, gmt_modified)
         VALUES (?, ?, ?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL 60 DAY), NOW(), NOW(), NOW())
         ON DUPLICATE KEY UPDATE work_item_slug=VALUES(work_item_slug)`,
        [w.id, w.workItemKey, repoName, w.domain, w.slug, `${w.slug}/`, `2026-Q1/${w.slug}/`],
      );
    }

    // 4. 生成 wiki recall 记录
    console.log('生成 wiki recall 记录…');
    const BATCH_SIZE = 500;
    let rows: unknown[][] = [];
    let totalReads = 0;
    let totalOther = 0;
    let toolCallSeq = 9_000_001;
    let interactionSeq = 9_000_001;

    for (const f of files) {
      const recallCount = Math.round(f.recallWeight);
      if (recallCount === 0) continue;
      const rawPathBase = `/Users/dev/projects/bk-fe-knowledge-${f.repo}`;
      const wikiAxis = f.relativePath.split('/')[1] === 'system' ? 'system' : f.relativePath.split('/')[1] ?? null;
      const wikiSystem = (() => {
        const seg = f.relativePath.split('/');
        if (seg[1] === 'system' && seg[2] === 'apps') return seg[3] ?? null;
        return null;
      })();

      for (let i = 0; i < recallCount; i++) {
        const user = pick(MOCK_USERS);
        const wi = pick(MOCK_WORK_ITEMS.filter(w => w.repo === f.repo));
        const eventTime = randomPast(90);
        const toolCallId = toolCallSeq++;
        const interactionId = interactionSeq++;
        const recallKey = `mock-${sha(String(toolCallId), f.relativePath, eventTime.toISOString())}`;

        rows.push([
          recallKey,
          toolCallId,
          interactionId,
          null,
          wi?.id ?? null,
          user.id,
          'read',
          `${rawPathBase}/${f.relativePath}`,
          f.relativePath,
          f.domain,
          wikiAxis,
          wikiSystem,
          null,
          null,
          eventTime,
          'mock-v1',
          new Date(),
          new Date(),
        ]);
        totalReads++;

        if (rows.length >= BATCH_SIZE) {
          await conn.query(
            `INSERT IGNORE INTO sdd_wiki_recalls
             (recall_key, tool_call_id, interaction_id, skill_usage_id, work_item_id, user_id,
              action_type, raw_path, wiki_relative_path, wiki_domain, wiki_axis, wiki_system,
              event_id, event_sequence, event_time, rule_version, gmt_create, gmt_modified)
             VALUES ?`,
            [rows],
          );
          rows = [];
        }
      }

      // 加一些 glob/grep 动作
      if (recallCount > 3) {
        for (let g = 0; g < Math.ceil(recallCount * 0.15); g++) {
          const user = pick(MOCK_USERS);
          const eventTime = randomPast(90);
          const toolCallId = toolCallSeq++;
          const interactionId = interactionSeq++;
          const recallKey = `mock-${sha('glob', String(toolCallId), f.relativePath, eventTime.toISOString())}`;
          rows.push([
            recallKey, toolCallId, interactionId, null, null, user.id,
            pick(['glob', 'grep']),
            `${rawPathBase}/${f.relativePath}`,
            f.relativePath, f.domain, wikiAxis, wikiSystem,
            null, null, eventTime, 'mock-v1', new Date(), new Date(),
          ]);
          totalOther++;
          if (rows.length >= BATCH_SIZE) {
            await conn.query(
              `INSERT IGNORE INTO sdd_wiki_recalls
               (recall_key, tool_call_id, interaction_id, skill_usage_id, work_item_id, user_id,
                action_type, raw_path, wiki_relative_path, wiki_domain, wiki_axis, wiki_system,
                event_id, event_sequence, event_time, rule_version, gmt_create, gmt_modified)
               VALUES ?`,
              [rows],
            );
            rows = [];
          }
        }
      }
    }

    // 5. Orphan paths（召回过但当前 KB 里没有）
    const orphanPaths = [
      { repo: 'trade', domain: 'cashier', path: 'domain-cashier/business/old-merchant-query.md', count: 12 },
      { repo: 'trade', domain: 'settlement', path: 'domain-settlement/business/legacy-rtgs.md', count: 8 },
      { repo: 'loan', domain: 'credit-review', path: 'domain-credit-review/business/v1-scoring.md', count: 15 },
      { repo: 'wealth', domain: 'portfolio', path: 'domain-portfolio/business/deprecated-holdings.md', count: 6 },
      { repo: 'loan', domain: 'risk-control', path: 'domain-risk-control/business/old-fraud-v1.md', count: 4 },
    ];
    for (const o of orphanPaths) {
      const rawPathBase = `/Users/dev/projects/bk-fe-knowledge-${o.repo}`;
      const wikiAxis = o.path.split('/')[1] ?? null;
      for (let i = 0; i < o.count; i++) {
        const user = pick(MOCK_USERS);
        const eventTime = randomPast(90);
        const toolCallId = toolCallSeq++;
        const interactionId = interactionSeq++;
        const recallKey = `mock-${sha('orphan', String(toolCallId), o.path, eventTime.toISOString())}`;
        rows.push([
          recallKey, toolCallId, interactionId, null, null, user.id,
          'read',
          `${rawPathBase}/${o.path}`,
          o.path, o.domain, wikiAxis, null,
          null, null, eventTime, 'mock-v1', new Date(), new Date(),
        ]);
        totalReads++;
        if (rows.length >= BATCH_SIZE) {
          await conn.query(
            `INSERT IGNORE INTO sdd_wiki_recalls
             (recall_key, tool_call_id, interaction_id, skill_usage_id, work_item_id, user_id,
              action_type, raw_path, wiki_relative_path, wiki_domain, wiki_axis, wiki_system,
              event_id, event_sequence, event_time, rule_version, gmt_create, gmt_modified)
             VALUES ?`,
            [rows],
          );
          rows = [];
        }
      }
    }

    // flush remaining
    if (rows.length > 0) {
      await conn.query(
        `INSERT IGNORE INTO sdd_wiki_recalls
         (recall_key, tool_call_id, interaction_id, skill_usage_id, work_item_id, user_id,
          action_type, raw_path, wiki_relative_path, wiki_domain, wiki_axis, wiki_system,
          event_id, event_sequence, event_time, rule_version, gmt_create, gmt_modified)
         VALUES ?`,
        [rows],
      );
    }

    await conn.commit();

    const deadFiles = files.filter(f => f.isDead).length;
    const newFiles = files.filter(f => f.isNew).length;
    console.log('');
    console.log('✅ Mock 数据注入完成');
    console.log(`   用户: ${MOCK_USERS.length} · 需求: ${MOCK_WORK_ITEMS.length}`);
    console.log(`   知识库文件: ${files.length} (死知识 ${deadFiles} / 新增未读 ${newFiles})`);
    console.log(`   Recall 记录: ${totalReads} read + ${totalOther} glob/grep = ${totalReads + totalOther} + ${orphanPaths.reduce((s, o) => s + o.count, 0)} orphan`);
    console.log('');
    console.log('启动命令：');
    console.log(`  KNOWLEDGE_BASE_ROOT=${KB_ROOT} pnpm dev:server`);
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
    await DB.end();
  }
}

seed().catch((err) => {
  console.error('❌ 失败:', err);
  process.exit(1);
});
