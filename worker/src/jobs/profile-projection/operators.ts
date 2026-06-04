import { knowledgeOperator } from './knowledge-operator';
import type { ProjectionOperator } from './runner';
import { SDD_BRIDGE_OPERATORS } from './sdd-bridge-operators';

/**
 * 按 profile 选择 projection 算子。
 * MVP-1 sdd-default：PR-4 桥接算子（capability/delivery/artifact/writes/turns）
 * + PR-5 knowledge 算子（非自证，必须排在桥接之后以复用 capability registry）。
 */
export function getProfileOperators(profileId: string): ProjectionOperator[] {
  if (profileId === 'sdd-default') {
    return [...SDD_BRIDGE_OPERATORS, knowledgeOperator];
  }
  return [];
}
