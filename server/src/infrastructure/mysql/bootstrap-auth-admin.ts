import { AuthPasswordSchema, AuthUsernameSchema } from '@sdd-telemetry/api';
import { hashPassword } from '../../modules/auth/auth-crypto';
import { createAppDataSource } from './data-source';

async function main(): Promise<void> {
  const username = requiredOption('--username', AuthUsernameSchema.parse);
  const displayName = requiredOption('--display-name', value => {
    const normalized = value.trim();
    if (!normalized || normalized.length > 64) {
      throw new Error('--display-name must contain 1 to 64 characters');
    }
    return normalized;
  });
  const password = AuthPasswordSchema.parse(
    process.env.AUTH_BOOTSTRAP_PASSWORD ?? (await readHiddenPassword('初始管理员密码: ')),
  );

  const dataSource = createAppDataSource();
  await dataSource.initialize();
  try {
    const rows = (await dataSource.query(
      `SELECT COUNT(*) AS count_value
       FROM auth_users
       WHERE role = 'super_admin'`,
    )) as Array<{ count_value: string | number }>;
    if (Number(rows[0]?.count_value ?? 0) > 0) {
      throw new Error('super_admin already exists; create further users in the admin page');
    }

    await dataSource.query(
      `INSERT INTO auth_users
        (username, display_name, password_hash, role, status, session_version,
         gmt_create, gmt_modified)
       VALUES (?, ?, ?, 'super_admin', 'active', 1, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
      [username, displayName, await hashPassword(password)],
    );
    console.info(`[sdd-telemetry] initial super_admin created: ${username}`);
  } finally {
    await dataSource.destroy();
  }
}

function requiredOption<T>(name: string, parse: (value: string) => T): T {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) {
    throw new Error(`missing required option: ${name}`);
  }
  return parse(value);
}

function readHiddenPassword(prompt: string): Promise<string> {
  if (!process.stdin.isTTY) {
    throw new Error('set AUTH_BOOTSTRAP_PASSWORD when stdin is not interactive');
  }

  return new Promise((resolve, reject) => {
    let value = '';
    const cleanup = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.off('data', onData);
    };
    const onData = (data: Buffer) => {
      const text = data.toString('utf8');
      if (text === '\u0003') {
        cleanup();
        process.stdout.write('\n');
        reject(new Error('cancelled'));
        return;
      }
      if (text === '\r' || text === '\n') {
        cleanup();
        process.stdout.write('\n');
        resolve(value);
        return;
      }
      if (text === '\u007f') {
        if (value.length > 0) {
          value = value.slice(0, -1);
          process.stdout.write('\b \b');
        }
        return;
      }
      if (!/[\u0000-\u001f]/.test(text)) {
        value += text;
        process.stdout.write('*'.repeat(text.length));
      }
    };

    process.stdout.write(prompt);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', onData);
  });
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
