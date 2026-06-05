import { BOSS_A_MONOREPO_PROFILE_ID } from '@sdd-telemetry/api';
import { BOSS_A_OPERATORS } from './boss-a-operators';
import { codeOperator } from './code-operator';
import { knowledgeOperator } from './knowledge-operator';
import type { ProjectionOperator } from './runner';
import { SDD_BRIDGE_OPERATORS } from './sdd-bridge-operators';

/**
 * 按 profile 选择 projection 算子。
 * MVP-1 sdd-default：桥接算子（capability/delivery/artifact/writes/turns）
 * + knowledge（非自证）+ code（轻量），knowledge/code 排在桥接之后以复用 capability registry。
 */
export function getProfileOperators(profileId: string): ProjectionOperator[] {
  if (profileId === 'sdd-default') {
    return [...SDD_BRIDGE_OPERATORS, knowledgeOperator, codeOperator];
  }
  if (profileId === BOSS_A_MONOREPO_PROFILE_ID) {
    return BOSS_A_OPERATORS;
  }
  return [];
}
