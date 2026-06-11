import { createHash } from 'node:crypto';
import type { SourceAction } from '@sdd-telemetry/api';

const READ_ACTIONS = new Set<SourceAction>(['read', 'grep', 'glob']);
const WRITE_ACTIONS = new Set<SourceAction>(['write', 'edit', 'update']);

export const SOURCE_BACKED_RULE_VERSION = 'source-backed-v1';

export function sourceBackedStableKey(profileId: string, kind: string, sourceReferenceKey: string): string {
  return sha256(`${profileId}:${kind}:${sourceReferenceKey}`);
}

export function isReadAction(actionType: string): boolean {
  return READ_ACTIONS.has(actionType as SourceAction);
}

export function isWriteAction(actionType: string): boolean {
  return WRITE_ACTIONS.has(actionType as SourceAction);
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
