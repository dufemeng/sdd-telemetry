import { describe, expect, it } from 'vitest';
import {
  E2E_MONOREPO_PROFILE_ID,
  getProfileConfig,
  resolveRuntimeProfileConfig,
  type LocalPathSourceRule,
  type McpDocSourceRule,
  type ResolvedSourceRule,
  type UrlSourceRule,
} from '@sdd-telemetry/api';
import { matchSourceReference } from '../src/jobs/profile-projection/source-registry/matcher';
import type { SourceReferenceFact } from '../src/jobs/profile-projection/source-registry/types';

const ROOT = '/repo/nxb-mono-repo';
const e2eRules = resolveRuntimeProfileConfig(getProfileConfig(E2E_MONOREPO_PROFILE_ID)!, {
  E2E_MONOREPO_ROOT: ROOT,
}).rules;
const e2eFuzzyRules = resolveRuntimeProfileConfig(getProfileConfig(E2E_MONOREPO_PROFILE_ID)!, {}).rules;

function fact(over: Partial<SourceReferenceFact>): SourceReferenceFact {
  return {
    sourceReferenceId: 1,
    sourceReferenceKey: 'k1',
    toolCallId: null,
    interactionId: null,
    eventId: null,
    userId: null,
    sessionId: null,
    promptId: null,
    actionType: 'read',
    locatorType: 'path',
    normalizedLocator: null,
    eventTime: null,
    mcpServer: null,
    mcpToolName: null,
    docId: null,
    url: null,
    title: null,
    spaceId: null,
    collectionId: null,
    docType: null,
    ...over,
  };
}

describe('matchSourceReference: local path', () => {
  it('matches a plan write as process_doc with relative locator', () => {
    const m = matchSourceReference(fact({ actionType: 'write', normalizedLocator: `${ROOT}/docs/plan/pay-order/design.md` }), e2eRules, E2E_MONOREPO_PROFILE_ID);
    expect(m?.category).toBe('process_doc');
    expect(m?.ruleId).toBe('e2e-plan-process-doc');
    expect(m?.relativeLocator).toBe('pay-order/design.md');
    expect(m?.resourceId).toBe('pay-order/design.md');
    expect(m?.ambiguous).toBe(false);
  });

  it('matches a docs read as knowledge', () => {
    const m = matchSourceReference(fact({ actionType: 'read', normalizedLocator: `${ROOT}/wiki/payment/api.md` }), e2eRules, E2E_MONOREPO_PROFILE_ID);
    expect(m?.category).toBe('knowledge');
    expect(m?.relativeLocator).toBe('payment/api.md');
  });

  it('matches implementation code writes', () => {
    const m = matchSourceReference(fact({ actionType: 'edit', normalizedLocator: `${ROOT}/src/App.tsx` }), e2eRules, E2E_MONOREPO_PROFILE_ID);
    expect(m?.category).toBe('code');
    expect(m?.ruleId).toBe('e2e-implementation-code');
  });

  it('matches implementation code by fuzzy pathContains when no root is configured', () => {
    const m = matchSourceReference(
      fact({ actionType: 'edit', normalizedLocator: '/Users/alice/work/nxb-mono-repo/src/App.tsx' }),
      e2eFuzzyRules,
      E2E_MONOREPO_PROFILE_ID,
    );
    expect(m?.category).toBe('code');
    expect(m?.ruleId).toBe('e2e-implementation-code');
    expect(m?.sourceNamespace).toBe('src');
    expect(m?.relativeLocator).toBe('src/App.tsx');
  });

  it('matches process docs by fuzzy pathContains when no root is configured', () => {
    const m = matchSourceReference(
      fact({ actionType: 'write', normalizedLocator: '/Users/bob/dev/nxb-mono-repo/docs/plan/pay-order/design.md' }),
      e2eFuzzyRules,
      E2E_MONOREPO_PROFILE_ID,
    );
    expect(m?.category).toBe('process_doc');
    expect(m?.ruleId).toBe('e2e-plan-process-doc');
    expect(m?.sourceNamespace).toBe('plan');
    expect(m?.relativeLocator).toBe('plan/pay-order/design.md');
  });

  it('does not treat code reads as implementation', () => {
    const m = matchSourceReference(fact({ actionType: 'read', normalizedLocator: `${ROOT}/src/App.tsx` }), e2eRules, E2E_MONOREPO_PROFILE_ID);
    expect(m).toBeNull();
  });

  it('prefers process_doc over code when rules overlap', () => {
    const overlappingRules: ResolvedSourceRule[] = [
      {
        rule: {
          locatorType: 'path',
          ruleId: 'process-doc',
          category: 'process_doc',
          priority: 100,
          confidence: 'high',
          enabled: true,
          rootPath: `${ROOT}/docs/plan`,
          actions: ['write'],
          includeGlobs: ['**/*.md'],
        } satisfies LocalPathSourceRule,
        resolvedRoot: `${ROOT}/docs/plan`,
      },
      {
        rule: {
          locatorType: 'path',
          ruleId: 'broad-code',
          category: 'code',
          priority: 10,
          confidence: 'high',
          enabled: true,
          rootPath: ROOT,
          actions: ['write'],
          includeGlobs: ['**/*'],
        } satisfies LocalPathSourceRule,
        resolvedRoot: ROOT,
      },
    ];

    const m = matchSourceReference(
      fact({ actionType: 'write', normalizedLocator: `${ROOT}/docs/plan/pay-order/design.md` }),
      overlappingRules,
      E2E_MONOREPO_PROFILE_ID,
    );
    expect(m?.category).toBe('process_doc');
    expect(m?.ruleId).toBe('process-doc');
  });

  it('returns null for the bare root directory', () => {
    const m = matchSourceReference(fact({ actionType: 'read', normalizedLocator: `${ROOT}/docs/plan` }), e2eRules, E2E_MONOREPO_PROFILE_ID);
    expect(m).toBeNull();
  });

  it('returns null for paths outside configured roots', () => {
    const m = matchSourceReference(fact({ actionType: 'read', normalizedLocator: `${ROOT}/scripts/build.sh` }), e2eRules, E2E_MONOREPO_PROFILE_ID);
    expect(m).toBeNull();
  });

  it('respects includeGlobs (non-md plan file does not match)', () => {
    const m = matchSourceReference(fact({ actionType: 'write', normalizedLocator: `${ROOT}/docs/plan/pay-order/notes.txt` }), e2eRules, E2E_MONOREPO_PROFILE_ID);
    expect(m).toBeNull();
  });

  it('returns null when the action is not in the rule', () => {
    const m = matchSourceReference(fact({ actionType: 'delete', normalizedLocator: `${ROOT}/docs/plan/pay-order/design.md` }), e2eRules, E2E_MONOREPO_PROFILE_ID);
    expect(m).toBeNull();
  });
});

const urlRule: ResolvedSourceRule = {
  rule: {
    locatorType: 'url', ruleId: 'url-knowledge', category: 'knowledge', priority: 100, confidence: 'high', enabled: true,
    urlPrefixes: ['https://host/creditdoc/frontedndoc/'], actions: ['read'],
    deny: { urlPrefixes: ['https://host/creditdoc/frontedndoc/internal/'] },
  } satisfies UrlSourceRule,
  resolvedRoot: null,
};

describe('matchSourceReference: url', () => {
  it('matches a known knowledge url prefix', () => {
    const m = matchSourceReference(fact({ locatorType: 'url', actionType: 'read', url: 'https://host/creditdoc/frontedndoc/abc123', normalizedLocator: 'https://host/creditdoc/frontedndoc/abc123' }), [urlRule], 'online-docs');
    expect(m?.category).toBe('knowledge');
    expect(m?.resourceId).toBe('https://host/creditdoc/frontedndoc/abc123');
  });

  it('does not match a different url', () => {
    const m = matchSourceReference(fact({ locatorType: 'url', actionType: 'read', url: 'https://host/other/doc', normalizedLocator: 'https://host/other/doc' }), [urlRule], 'online-docs');
    expect(m).toBeNull();
  });

  it('honours deny prefixes', () => {
    const m = matchSourceReference(fact({ locatorType: 'url', actionType: 'read', url: 'https://host/creditdoc/frontedndoc/internal/x', normalizedLocator: 'https://host/creditdoc/frontedndoc/internal/x' }), [urlRule], 'online-docs');
    expect(m).toBeNull();
  });
});

const mcpRule: ResolvedSourceRule = {
  rule: {
    locatorType: 'mcp_doc', ruleId: 'mcp-reqs', category: 'process_doc', priority: 100, confidence: 'high', enabled: true,
    mcpServers: ['confluence'], collectionIds: ['REQ'], docTypes: ['requirement'], actions: ['write', 'update'],
  } satisfies McpDocSourceRule,
  resolvedRoot: null,
};

describe('matchSourceReference: mcp_doc', () => {
  it('matches when all configured conditions match', () => {
    const m = matchSourceReference(fact({ locatorType: 'mcp_doc', actionType: 'write', mcpServer: 'confluence', collectionId: 'REQ', docType: 'requirement', docId: 'DOC-9' }), [mcpRule], 'online-docs');
    expect(m?.category).toBe('process_doc');
    expect(m?.resourceId).toBe('DOC-9');
  });

  it('does not match when a configured condition mismatches (AND semantics)', () => {
    const m = matchSourceReference(fact({ locatorType: 'mcp_doc', actionType: 'write', mcpServer: 'confluence', collectionId: 'OTHER', docType: 'requirement', docId: 'DOC-9' }), [mcpRule], 'online-docs');
    expect(m).toBeNull();
  });

  it('does not match a same-server doc that lacks the required collection/docType (negative sample)', () => {
    const m = matchSourceReference(fact({ locatorType: 'mcp_doc', actionType: 'write', mcpServer: 'confluence', docId: 'DOC-9' }), [mcpRule], 'online-docs');
    expect(m).toBeNull();
  });
});

describe('matchSourceReference: ambiguity', () => {
  it('flags ambiguous when two same-category same-priority rules both match', () => {
    const r1: ResolvedSourceRule = { rule: { locatorType: 'path', ruleId: 'a', category: 'code', priority: 50, confidence: 'high', enabled: true, rootPath: ROOT, actions: ['read'] }, resolvedRoot: ROOT };
    const r2: ResolvedSourceRule = { rule: { locatorType: 'path', ruleId: 'b', category: 'code', priority: 50, confidence: 'high', enabled: true, rootPath: ROOT, actions: ['read'] }, resolvedRoot: ROOT };
    const m = matchSourceReference(fact({ actionType: 'read', normalizedLocator: `${ROOT}/x/y.ts` }), [r1, r2], 'p');
    expect(m).not.toBeNull();
    expect(m?.ambiguous).toBe(true);
  });

  it('is not ambiguous when priorities differ', () => {
    const r1: ResolvedSourceRule = { rule: { locatorType: 'path', ruleId: 'a', category: 'code', priority: 90, confidence: 'high', enabled: true, rootPath: ROOT, actions: ['read'] }, resolvedRoot: ROOT };
    const r2: ResolvedSourceRule = { rule: { locatorType: 'path', ruleId: 'b', category: 'code', priority: 50, confidence: 'high', enabled: true, rootPath: ROOT, actions: ['read'] }, resolvedRoot: ROOT };
    const m = matchSourceReference(fact({ actionType: 'read', normalizedLocator: `${ROOT}/x/y.ts` }), [r1, r2], 'p');
    expect(m?.ruleId).toBe('a');
    expect(m?.ambiguous).toBe(false);
  });
});
