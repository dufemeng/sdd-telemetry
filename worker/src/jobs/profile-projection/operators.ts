import type { WorkflowProfileConfig } from '@sdd-telemetry/api';
import { codeOperator } from './code-operator';
import { knowledgeOperator } from './knowledge-operator';
import type { ProjectionOperator } from './runner';
import { profileErrorOperator } from './error-operator';
import { SDD_BRIDGE_OPERATORS } from './sdd-bridge-operators';
import { SOURCE_BACKED_OPERATORS } from './source-backed-operators';

/**
 * 按 profile 选择 projection 算子。
 * MVP-1 sdd-default：桥接算子（capability/delivery/artifact/writes/turns）
 * + knowledge（非自证）+ code（轻量），knowledge/code 排在桥接之后以复用 capability registry。
 */
export function getProfileOperators(config: WorkflowProfileConfig): ProjectionOperator[] {
  if (config.status !== 'active') return [];

  if (config.projectionMode === 'sdd_bridge') {
    return [...SDD_BRIDGE_OPERATORS, knowledgeOperator, codeOperator, profileErrorOperator];
  }
  if (config.projectionMode === 'source_backed') {
    return [...SOURCE_BACKED_OPERATORS, profileErrorOperator];
  }
  return [];
}
