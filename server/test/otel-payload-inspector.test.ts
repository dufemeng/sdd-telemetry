import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createUserKey, summarizeOtlpPayload } from '../src/modules/ingest/otel-payload-inspector';

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
  it('keeps configured install identity ahead of Claude Code user.id', () => {
    const summary = summarizeOtlpPayload(
      payload({
        installId: 'configured-install',
        otelUserId: 'claude-user',
        body: 'first event',
        timeUnixNano: '1779689210646000000',
      }),
    );

    expect(summary.userHints.otelUserId).toBe('claude-user');
    expect(createUserKey(summary.userHints, summary.payloadHash)).toBe(
      sha256('install:configured-install'),
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
