import { createHash } from 'node:crypto';
import type { RuntimeResolution, WorkflowProfileConfig } from '@sdd-telemetry/api';

export const PROFILE_PROJECTION_ADAPTER_VERSION = 'profile-maintainer-snapshot-v1';

export function resolvedProfileConfigHash(
  config: WorkflowProfileConfig,
  runtime: RuntimeResolution,
): string {
  return sha256(stableStringify({
    adapterVersion: PROFILE_PROJECTION_ADAPTER_VERSION,
    projectionMode: config.projectionMode,
    sourceRules: runtime.rules.map(({ rule, resolvedRoot }) => ({
      rule,
      resolvedRoot,
    })),
    unresolved: runtime.unresolved,
    deliveryUnitRules: config.deliveryUnitRules,
    artifactRules: config.artifactRules,
    capabilityRules: config.capabilityRules,
    attributionPolicy: config.attributionPolicy,
  }));
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortForStableHash(value));
}

function sortForStableHash(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForStableHash);
  if (!value || typeof value !== 'object') return value;

  const input = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(input).sort()) {
    out[key] = sortForStableHash(input[key]);
  }
  return out;
}
