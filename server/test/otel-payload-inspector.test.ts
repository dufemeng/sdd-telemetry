import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createUserKey,
  extractHeaderHints,
  mergeUserHints,
  summarizeOtlpPayload,
} from '../src/modules/ingest/otel-payload-inspector';

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function payload(input: {
  installId?: string;
  otelUserId?: string;
  body: string;
  timeUnixNano: string;
}) {
  const resourceAttributes = input.installId
    ? [{ key: 'sdd.install_id', value: { stringValue: input.installId } }]
    : [];
  const logAttributes = input.otelUserId
    ? [{ key: 'user.id', value: { stringValue: input.otelUserId } }]
    : [];

  return {
    resourceLogs: [
      {
        resource: { attributes: resourceAttributes },
        scopeLogs: [
          {
            logRecords: [
              {
                timeUnixNano: input.timeUnixNano,
                body: { stringValue: input.body },
                attributes: logAttributes,
              },
            ],
          },
        ],
      },
    ],
  };
}

describe('OTLP ingest user identity', () => {
  it('prefers Claude Code user.id over configured install identity', () => {
    const summary = summarizeOtlpPayload(
      payload({
        installId: 'configured-install',
        otelUserId: 'claude-user',
        body: 'first event',
        timeUnixNano: '1779689210646000000',
      }),
    );

    expect(summary.userHints.installId).toBe('configured-install');
    expect(summary.userHints.otelUserId).toBe('claude-user');
    expect(createUserKey(summary.userHints, summary.payloadHash)).toBe(
      sha256('otel-user:claude-user'),
    );
  });

  it('uses log record user.id to merge changing payloads when resource identity is absent', () => {
    const first = summarizeOtlpPayload(
      payload({
        otelUserId: 'stable-claude-user',
        body: 'first event',
        timeUnixNano: '1779689210646000000',
      }),
    );
    const second = summarizeOtlpPayload(
      payload({
        otelUserId: 'stable-claude-user',
        body: 'second event',
        timeUnixNano: '1779689210647000000',
      }),
    );

    expect(first.payloadHash).not.toBe(second.payloadHash);
    expect(createUserKey(first.userHints, first.payloadHash)).toBe(
      sha256('otel-user:stable-claude-user'),
    );
    expect(createUserKey(second.userHints, second.payloadHash)).toBe(
      sha256('otel-user:stable-claude-user'),
    );
  });

  // Claude Code 同一进程内会发两种 payload：A 路无 install_id，B 路有 install_id。
  // 这里断言两路必须落到同一 user_key（按 user.id 收敛），不能因为 B 路带 install_id 就分裂出新用户。
  it('merges payloads from same Claude Code install regardless of whether resource carries install_id', () => {
    const withInstall = summarizeOtlpPayload(
      payload({
        installId: 'sdd-yjr8zq',
        otelUserId: 'shared-claude-user',
        body: 'channel B event',
        timeUnixNano: '1779689210646000000',
      }),
    );
    const withoutInstall = summarizeOtlpPayload(
      payload({
        otelUserId: 'shared-claude-user',
        body: 'channel A event',
        timeUnixNano: '1779689210647000000',
      }),
    );

    expect(createUserKey(withInstall.userHints, withInstall.payloadHash)).toBe(
      createUserKey(withoutInstall.userHints, withoutInstall.payloadHash),
    );
  });

  it('uses payload identity only when no stable identity hint is reported', () => {
    const summary = summarizeOtlpPayload(
      payload({
        body: 'anonymous event',
        timeUnixNano: '1779689210646000000',
      }),
    );

    expect(createUserKey(summary.userHints, summary.payloadHash)).toBe(
      sha256(`unknown:${summary.payloadHash}`),
    );
  });
});

describe('HTTP header hint extraction', () => {
  it('extracts all supported sdd-* headers', () => {
    const hints = extractHeaderHints({
      'sdd-install-id': 'sdd-yjr8zq',
      'sdd-user-name': 'loomisli',
      'sdd-machine-id': 'mac-001',
      'sdd-machine-name': 'MacBook-Pro.local',
      'sdd-requirements-root-path': '/Users/me/reqs',
      'sdd-wiki-root-path': '/Users/me/wiki',
      'content-type': 'application/json',
    });

    expect(hints).toEqual({
      installId: 'sdd-yjr8zq',
      userName: 'loomisli',
      machineId: 'mac-001',
      machineName: 'MacBook-Pro.local',
      requirementsRootPath: '/Users/me/reqs',
      wikiRootPath: '/Users/me/wiki',
    });
  });

  it('decodes percent-encoded values for non-ASCII names', () => {
    const hints = extractHeaderHints({
      'sdd-user-name': '%E7%9F%A5%E6%9D%8E',
    });
    expect(hints.userName).toBe('知李');
  });

  it('skips missing or empty headers', () => {
    const hints = extractHeaderHints({
      'sdd-install-id': '',
      'sdd-user-name': undefined,
    });
    expect(hints).toEqual({});
  });

  it('picks first value when header arrives as array', () => {
    const hints = extractHeaderHints({
      'sdd-install-id': ['first', 'second'],
    });
    expect(hints.installId).toBe('first');
  });
});

describe('mergeUserHints', () => {
  const baseHints = {
    installId: null,
    otelUserId: 'claude-user-id',
    userName: null,
    machineId: null,
    machineName: null,
    osName: 'darwin',
    osVersion: '25.0.0',
    clientName: 'claude-code',
    clientVersion: '2.1.150',
    requirementsRootPath: null,
    wikiRootPath: null,
  };

  it('fills null base fields with header values', () => {
    const merged = mergeUserHints(baseHints, {
      installId: 'sdd-from-header',
      requirementsRootPath: '/from/header',
    });
    expect(merged.installId).toBe('sdd-from-header');
    expect(merged.requirementsRootPath).toBe('/from/header');
    expect(merged.otelUserId).toBe('claude-user-id');
  });

  it('overrides non-null base fields with header values', () => {
    const merged = mergeUserHints({ ...baseHints, installId: 'from-resource' }, {
      installId: 'from-header',
    });
    expect(merged.installId).toBe('from-header');
  });

  it('keeps base value when header value is null or undefined', () => {
    const merged = mergeUserHints({ ...baseHints, installId: 'from-resource' }, {
      installId: null,
    });
    expect(merged.installId).toBe('from-resource');
  });

  // 端到端：模拟 Claude Code Provider #1 发的 A 路 payload（resource 无 sdd.* 字段），
  // 但 HTTP header 带了完整配置。合并后 user_key 仍然由 user.id 决定，
  // 但 requirements_root_path / install_id 都应该从 header 拿到。
  it('header hints rescue requirements_root_path when resource attributes are missing', () => {
    const summary = summarizeOtlpPayload({
      resourceLogs: [
        {
          resource: { attributes: [] },
          scopeLogs: [
            {
              logRecords: [
                {
                  timeUnixNano: '1779689210646000000',
                  body: { stringValue: 'channel A startup event' },
                  attributes: [
                    { key: 'user.id', value: { stringValue: 'claude-user-id' } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    const headerHints = extractHeaderHints({
      'sdd-install-id': 'sdd-yjr8zq',
      'sdd-requirements-root-path': '/Users/me/reqs',
      'sdd-wiki-root-path': '/Users/me/wiki',
    });
    const merged = mergeUserHints(summary.userHints, headerHints);

    expect(merged.installId).toBe('sdd-yjr8zq');
    expect(merged.requirementsRootPath).toBe('/Users/me/reqs');
    expect(merged.wikiRootPath).toBe('/Users/me/wiki');
    // user.id 仍然胜出 user_key，install_id 只作为元数据填进 sdd_users
    expect(createUserKey(merged, summary.payloadHash)).toBe(
      sha256('otel-user:claude-user-id'),
    );
  });
});
