import { createMysqlPool } from '../infrastructure/mysql/client';
import { createLogger } from '../support/logger';
import { getProfileOperators } from './profile-projection/operators';
import { runProfileProjection } from './profile-projection/runner';

/**
 * profile full rebuild 命令（MVP-1，Task 7）。
 * 用法：pnpm profile:rebuild -- --profile sdd-default
 */

function parseProfileArg(): string {
  const idx = process.argv.indexOf('--profile');
  const value = idx >= 0 ? process.argv[idx + 1] : undefined;
  return value ?? process.env.PROFILE_ID ?? 'sdd-default';
}

async function main(): Promise<void> {
  const profileId = parseProfileArg();
  const operators = getProfileOperators(profileId);
  // 未知 / 未配置 profile 直接失败，避免建出「成功但无数据」的 run 并误切 pointer。
  if (operators.length === 0) {
    throw new Error(`unknown or unconfigured profile: ${profileId}（无 projection 算子）`);
  }

  const pool = createMysqlPool();
  const logger = createLogger('profile-rebuild');
  try {
    const result = await runProfileProjection({ pool, logger, profileId, operators });
    console.info(JSON.stringify(result));
  } finally {
    await pool.end();
  }
}

void main();
