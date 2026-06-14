import path from 'node:path';
import type {
  LocalPathSourceRule,
  McpDocSourceRule,
  ResolvedSourceRule,
  SourceAction,
  SourceLocatorType,
  UrlSourceRule,
} from '@sdd-telemetry/api';
import type { MatchedSource, SourceReferenceFact } from './types';

const CONFIDENCE_ORDER = { high: 3, medium: 2, low: 1 } as const;

export function matchSourceReference(
  fact: SourceReferenceFact,
  rules: ResolvedSourceRule[],
  profileId: string,
): MatchedSource | null {
  const candidates = rules
    .map((rule) => matchRule(fact, rule, profileId))
    .filter((match): match is MatchedSource => match !== null);

  if (candidates.length === 0) return null;
  candidates.sort(compareMatchedSource);

  const best = candidates[0]!;
  const ambiguous = candidates.slice(1).some(
    (candidate) =>
      candidate.category === best.category &&
      candidate.confidence === best.confidence &&
      priorityOf(candidate) === priorityOf(best),
  );

  return { ...best, ambiguous };
}

function matchRule(
  fact: SourceReferenceFact,
  resolved: ResolvedSourceRule,
  profileId: string,
): MatchedSource | null {
  const rule = resolved.rule;
  if (!rule.enabled) return null;
  if (!rule.actions.includes(fact.actionType as SourceAction)) return null;
  if (rule.locatorType !== fact.locatorType) return null;

  if (rule.locatorType === 'path') {
    return matchLocalPathRule(fact, resolved as ResolvedSourceRule & { rule: LocalPathSourceRule }, profileId);
  }
  if (rule.locatorType === 'url') {
    return matchUrlRule(fact, resolved as ResolvedSourceRule & { rule: UrlSourceRule }, profileId);
  }
  return matchMcpDocRule(fact, resolved as ResolvedSourceRule & { rule: McpDocSourceRule }, profileId);
}

function matchLocalPathRule(
  fact: SourceReferenceFact,
  resolved: ResolvedSourceRule & { rule: LocalPathSourceRule },
  profileId: string,
): MatchedSource | null {
  if (!fact.normalizedLocator) return null;
  const locator = normalizePath(fact.normalizedLocator);

  const pathMatch = resolved.resolvedRoot
    ? matchRootedPath(locator, resolved.resolvedRoot, resolved.rule)
    : matchFuzzyPath(locator, resolved.rule);
  if (!pathMatch) return null;

  const { relativeLocator, sourceNamespace, root } = pathMatch;
  if (relativeLocator === '') return null;
  if (!matchesGlobs(relativeLocator, resolved.rule.includeGlobs, true)) return null;
  if (matchesGlobs(relativeLocator, resolved.rule.excludeGlobs, false)) return null;

  return {
    profileId,
    sourceReferenceId: fact.sourceReferenceId,
    sourceReferenceKey: fact.sourceReferenceKey,
    ruleId: resolved.rule.ruleId,
    confidence: resolved.rule.confidence,
    ambiguous: false,
    category: resolved.rule.category,
    actionType: fact.actionType as SourceAction,
    locatorType: 'path',
    normalizedLocator: locator,
    sourceNamespace,
    resourceId: relativeLocator,
    relativeLocator,
    metadata: {
      root,
      matchMode: resolved.resolvedRoot ? 'root' : 'fuzzy',
      relativeRoot: resolved.rule.relativeRoot ?? null,
      rootName: sourceNamespace,
      rulePriority: resolved.rule.priority,
      title: fact.title,
    },
  };
}

function matchRootedPath(
  locator: string,
  resolvedRoot: string,
  rule: LocalPathSourceRule,
): { relativeLocator: string; sourceNamespace: string; root: string } | null {
  const root = normalizeRoot(resolvedRoot);
  if (!isInside(locator, root)) return null;

  const relativeLocator = locator === root ? '' : locator.slice(root.length + 1);
  const sourceNamespace = rule.relativeRoot && rule.relativeRoot !== '.'
    ? rule.relativeRoot
    : path.posix.basename(root);
  return { relativeLocator, sourceNamespace, root };
}

function matchFuzzyPath(
  locator: string,
  rule: LocalPathSourceRule,
): { relativeLocator: string; sourceNamespace: string; root: string | null } | null {
  const contains = (rule.pathContains ?? [])
    .map((value) => normalizePath(value))
    .find((value) => containsPath(locator, value));
  if (contains) {
    return fuzzyPathResult(locator, contains);
  }

  for (const pattern of rule.pathRegexes ?? []) {
    const regex = safeRegex(pattern);
    if (!regex) continue;
    const match = regex.exec(locator);
    if (!match) continue;
    return fuzzyPathResult(locator, match[1] ?? match[0]);
  }

  return null;
}

function fuzzyPathResult(
  locator: string,
  marker: string,
): { relativeLocator: string; sourceNamespace: string; root: string | null } {
  const normalizedMarker = marker.replace(/\\/g, '/');
  const locatorLower = locator.toLowerCase();
  const markerLower = normalizedMarker.toLowerCase();
  const index = locatorLower.indexOf(markerLower);
  const matchedMarker = index >= 0 ? locator.slice(index, index + normalizedMarker.length) : normalizedMarker;
  const tail = index >= 0
    ? locator.slice(index + normalizedMarker.length).replace(/^\/+/, '')
    : path.posix.basename(locator);
  const namespaceParts = matchedMarker.split('/').filter(Boolean);
  const sourceNamespace = namespaceParts[namespaceParts.length - 1] ?? 'path';
  const relativeLocator = tail ? `${sourceNamespace}/${tail}` : sourceNamespace;
  return {
    relativeLocator,
    sourceNamespace,
    root: null,
  };
}

function matchUrlRule(
  fact: SourceReferenceFact,
  resolved: ResolvedSourceRule & { rule: UrlSourceRule },
  profileId: string,
): MatchedSource | null {
  const locator = fact.url ?? fact.normalizedLocator;
  if (!locator) return null;
  if (isDeniedUrl(locator, resolved.rule)) return null;

  const prefix = (resolved.rule.urlPrefixes ?? []).find((p) => locator.startsWith(p));
  const regex = (resolved.rule.urlRegexes ?? []).find((pattern) => safeRegex(pattern)?.test(locator));
  if (!prefix && !regex) return null;

  const resourceId = captureResourceId(locator, resolved.rule.resourceIdCapture) ?? locator;
  return {
    profileId,
    sourceReferenceId: fact.sourceReferenceId,
    sourceReferenceKey: fact.sourceReferenceKey,
    ruleId: resolved.rule.ruleId,
    confidence: resolved.rule.confidence,
    ambiguous: false,
    category: resolved.rule.category,
    actionType: fact.actionType as SourceAction,
    locatorType: 'url',
    normalizedLocator: locator,
    sourceNamespace: prefix ?? regex ?? null,
    resourceId,
    relativeLocator: null,
    metadata: {
      url: locator,
      rulePriority: resolved.rule.priority,
      title: fact.title,
      docType: fact.docType,
      spaceId: fact.spaceId,
      collectionId: fact.collectionId,
    },
  };
}

function matchMcpDocRule(
  fact: SourceReferenceFact,
  resolved: ResolvedSourceRule & { rule: McpDocSourceRule },
  profileId: string,
): MatchedSource | null {
  const rule = resolved.rule;
  if (hasItems(rule.mcpServers) && !rule.mcpServers!.includes(fact.mcpServer ?? '')) return null;
  if (hasItems(rule.toolNames) && !rule.toolNames!.includes(fact.mcpToolName ?? '')) return null;
  if (hasItems(rule.spaceIds) && !rule.spaceIds!.includes(fact.spaceId ?? '')) return null;
  if (hasItems(rule.collectionIds) && !rule.collectionIds!.includes(fact.collectionId ?? '')) return null;
  if (hasItems(rule.docTypes) && !rule.docTypes!.includes(fact.docType ?? '')) return null;
  if (hasItems(rule.urlPrefixes) && !rule.urlPrefixes!.some((prefix) => (fact.url ?? fact.normalizedLocator ?? '').startsWith(prefix))) return null;
  if (hasItems(rule.docIdPatterns) && !rule.docIdPatterns!.some((pattern) => globMatch(fact.docId ?? '', pattern))) return null;
  if (isDeniedMcpDoc(fact, rule)) return null;

  const locator = fact.normalizedLocator ?? fact.url ?? fact.docId ?? `${fact.collectionId ?? 'mcp'}:${fact.title ?? fact.sourceReferenceKey}`;
  return {
    profileId,
    sourceReferenceId: fact.sourceReferenceId,
    sourceReferenceKey: fact.sourceReferenceKey,
    ruleId: rule.ruleId,
    confidence: rule.confidence,
    ambiguous: false,
    category: rule.category,
    actionType: fact.actionType as SourceAction,
    locatorType: 'mcp_doc',
    normalizedLocator: locator,
    sourceNamespace: [fact.mcpServer, fact.collectionId ?? fact.spaceId].filter(Boolean).join('/') || null,
    resourceId: fact.docId ?? locator,
    relativeLocator: null,
    metadata: {
      mcpServer: fact.mcpServer,
      rulePriority: rule.priority,
      mcpToolName: fact.mcpToolName,
      docId: fact.docId,
      url: fact.url,
      title: fact.title,
      spaceId: fact.spaceId,
      collectionId: fact.collectionId,
      docType: fact.docType,
    },
  };
}

function compareMatchedSource(a: MatchedSource, b: MatchedSource): number {
  const confidence = CONFIDENCE_ORDER[b.confidence] - CONFIDENCE_ORDER[a.confidence];
  if (confidence !== 0) return confidence;
  const priority = priorityOf(b) - priorityOf(a);
  if (priority !== 0) return priority;
  return a.ruleId.localeCompare(b.ruleId);
}

function priorityOf(match: MatchedSource): number {
  return Number(match.metadata.rulePriority ?? 0);
}

function matchesGlobs(value: string, globs: string[] | undefined, defaultValue: boolean): boolean {
  if (!globs || globs.length === 0) return defaultValue;
  return globs.some((glob) => globMatch(value, glob));
}

export function globMatch(value: string, pattern: string): boolean {
  const normalizedValue = normalizePath(value);
  const normalizedPattern = pattern.replace(/\\/g, '/');

  if (normalizedPattern === '**/*') return normalizedValue.length > 0;
  if (normalizedPattern.endsWith('/**')) {
    const prefix = normalizedPattern.slice(0, -3).replace(/\/+$/, '');
    return normalizedValue === prefix || normalizedValue.startsWith(`${prefix}/`);
  }
  if (normalizedPattern.startsWith('**/*.')) {
    return normalizedValue.toLowerCase().endsWith(normalizedPattern.slice(4).toLowerCase());
  }

  const escaped = normalizedPattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const regex = escaped
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]');
  return new RegExp(`^${regex}$`, 'i').test(normalizedValue);
}

function isDeniedUrl(locator: string, rule: UrlSourceRule): boolean {
  const deny = rule.deny;
  if (!deny) return false;
  if ((deny.urlPrefixes ?? []).some((prefix) => locator.startsWith(prefix))) return true;
  if ((deny.urlRegexes ?? []).some((pattern) => safeRegex(pattern)?.test(locator))) return true;
  return false;
}

function isDeniedMcpDoc(fact: SourceReferenceFact, rule: McpDocSourceRule): boolean {
  const deny = rule.deny;
  if (!deny) return false;
  if ((deny.urlPrefixes ?? []).some((prefix) => (fact.url ?? fact.normalizedLocator ?? '').startsWith(prefix))) return true;
  if ((deny.docTypes ?? []).includes(fact.docType ?? '')) return true;
  if ((deny.titlePatterns ?? []).some((pattern) => globMatch(fact.title ?? '', pattern))) return true;
  return false;
}

function captureResourceId(locator: string, pattern: string | undefined): string | null {
  if (!pattern) return null;
  const regex = safeRegex(pattern);
  if (!regex) return null;
  const match = regex.exec(locator);
  return match?.[1] ?? match?.[0] ?? null;
}

function safeRegex(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
}

function hasItems(value: unknown[] | undefined): boolean {
  return Array.isArray(value) && value.length > 0;
}

function isInside(locator: string, root: string): boolean {
  return locator === root || locator.startsWith(`${root}/`);
}

function containsPath(locator: string, marker: string): boolean {
  return locator.toLowerCase().includes(marker.toLowerCase());
}

function normalizeRoot(value: string): string {
  return normalizePath(value).replace(/\/+$/, '');
}

function normalizePath(value: string): string {
  return path.posix.normalize(value.replace(/\\/g, '/'));
}

export function toSourceLocatorType(value: string): SourceLocatorType | null {
  if (value === 'path' || value === 'url' || value === 'mcp_doc') return value;
  return null;
}
