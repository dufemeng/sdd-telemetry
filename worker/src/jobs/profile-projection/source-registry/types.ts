import type {
  ProfileRuleConfidence,
  SourceAction,
  SourceCategory,
  SourceLocatorType,
} from '@sdd-telemetry/api';

/**
 * 通用 source registry executor 的输入事实，对应 source_references 一行
 * （含 url / mcp_doc 归一化元数据）。matcher / operators 只消费这个结构，不理解 profile。
 */
export interface SourceReferenceFact {
  sourceReferenceId: number;
  sourceReferenceKey: string;
  toolCallId: number | null;
  interactionId: number | null;
  eventId: string | null;
  userId: number | null;
  sessionId: string | null;
  promptId: string | null;
  actionType: string;
  locatorType: string;
  normalizedLocator: string | null;
  eventTime: Date | null;
  mcpServer: string | null;
  mcpToolName: string | null;
  docId: string | null;
  url: string | null;
  title: string | null;
  spaceId: string | null;
  collectionId: string | null;
  docType: string | null;
}

/**
 * matcher 输出的统一结构（设计 §5.5）。operators 据此投影，不再关心 path / url / mcp 细节。
 */
export interface MatchedSource {
  profileId: string;
  sourceReferenceId: number;
  sourceReferenceKey: string;
  ruleId: string;
  confidence: ProfileRuleConfidence;
  ambiguous: boolean;
  category: SourceCategory;
  actionType: SourceAction;
  locatorType: SourceLocatorType;
  normalizedLocator: string;
  /** 稳定来源命名空间：local=relativeRoot/repo label；url=host+prefix；mcp=server/collection。 */
  sourceNamespace: string | null;
  /** 稳定资源身份：local=root 下相对路径；url=规范化 url / 捕获 id；mcp=docId / collection+docId。 */
  resourceId: string | null;
  /** local path 在 root 下的相对路径；url / mcp 为 null。 */
  relativeLocator: string | null;
  metadata: Record<string, unknown>;
}
