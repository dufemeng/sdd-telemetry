import type { ProjectionOperator } from './runner';
import { SDD_BRIDGE_OPERATORS } from './sdd-bridge-operators';

/**
 * 按 profile 选择 projection 算子。
 * MVP-1 只支持 sdd-default：PR-4 桥接算子（capability/delivery/artifact/writes/turns）。
 * PR-5 会追加 knowledge / code 算子。
 */
export function getProfileOperators(profileId: string): ProjectionOperator[] {
  if (profileId === 'sdd-default') {
    return [...SDD_BRIDGE_OPERATORS];
  }
  return [];
}
