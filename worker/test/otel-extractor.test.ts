import { describe, expect, it } from 'vitest';
import { extractOtelLogEvents } from '../src/jobs/otel-extractor';

function logRecord(attributes: Array<{ key: string; value: Record<string, unknown> }>) {
  return {
    timeUnixNano: '1778769901000000000',
    body: { stringValue: 'claude_code.api_request' },
    attributes,
  };
}

describe('extractOtelLogEvents', () => {
  it('extracts event.sequence and prompt.id without falling back to request_id', () => {
    const [withPrompt, withoutPrompt] = extractOtelLogEvents(
      {
        resourceLogs: [
          {
            resource: { attributes: [] },
            scopeLogs: [
              {
                logRecords: [
                  logRecord([
                    {
                      key: 'event.name',
                      value: { stringValue: 'api_request' },
                    },
                    { key: 'event.sequence', value: { intValue: '42' } },
                    { key: 'session.id', value: { stringValue: 'session-1' } },
                    { key: 'prompt.id', value: { stringValue: 'prompt-1' } },
                    {
                      key: 'request_id',
                      value: { stringValue: 'req_ignored' },
                    },
                  ]),
                  logRecord([
                    {
                      key: 'event.name',
                      value: { stringValue: 'api_request' },
                    },
                    { key: 'event.sequence', value: { intValue: '43' } },
                    { key: 'session.id', value: { stringValue: 'session-1' } },
                    {
                      key: 'request_id',
                      value: { stringValue: 'req_not_a_prompt' },
                    },
                  ]),
                ],
              },
            ],
          },
        ],
      },
      'batch-1',
    );

    expect(withPrompt?.eventSequence).toBe(42);
    expect(withPrompt?.promptId).toBe('prompt-1');
    expect(withoutPrompt?.eventSequence).toBe(43);
    expect(withoutPrompt?.promptId).toBeNull();
  });
});
