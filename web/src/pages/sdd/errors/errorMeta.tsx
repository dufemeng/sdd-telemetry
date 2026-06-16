import { Bug, Code2, DatabaseZap, FileWarning, Wrench } from 'lucide-react';
import type { ProfileErrorCategoryContract } from '@sdd-telemetry/api';

export const ERROR_CATEGORY_ICONS: Record<ProfileErrorCategoryContract, typeof FileWarning> = {
  knowledge_read_failed: DatabaseZap,
  process_doc_access_failed: FileWarning,
  code_operation_failed: Code2,
  tool_execution_failed: Wrench,
  model_or_api_failed: Bug,
};

export const ERROR_CATEGORY_LABELS: Record<ProfileErrorCategoryContract, string> = {
  knowledge_read_failed: '知识库读取失败',
  process_doc_access_failed: '过程文档访问失败',
  code_operation_failed: '代码操作失败',
  tool_execution_failed: '工具调用失败',
  model_or_api_failed: '模型/API 异常',
};

export const ERROR_CATEGORY_DESCRIPTIONS: Record<ProfileErrorCategoryContract, string> = {
  knowledge_read_failed: '知识库链接为空、文件不存在、MCP 文档读取失败、读取 token 超限等知识访问问题。',
  process_doc_access_failed: '需求、计划、任务等过程文档的读取或写入失败。',
  code_operation_failed: '代码文件读写、检索、编辑等操作失败。',
  tool_execution_failed: '未命中业务来源的通用工具调用失败。',
  model_or_api_failed: '模型调用、API 错误或客户端内部异常。',
};

export function errorCategoryLabel(category: ProfileErrorCategoryContract): string {
  return ERROR_CATEGORY_LABELS[category] ?? category;
}

export function buildErrorCategoryPath(category: ProfileErrorCategoryContract): string {
  return `/sdd/errors/${category}`;
}

export function buildErrorReasonPath(reasonCode: string): string {
  const params = new URLSearchParams({ reasonCode });
  return `/sdd/errors/knowledge_read_failed?${params}`;
}

export function buildErrorEventPath(errorEventId: string): string {
  return `/sdd/errors/events/${errorEventId}`;
}
