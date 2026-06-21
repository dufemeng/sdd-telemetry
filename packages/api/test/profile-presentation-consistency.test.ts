import { describe, expect, it } from 'vitest';
import { listProfileConfigs } from '../src/profile-config/profile-registry';

describe('profile presentation 与 projectionMode 一致性', () => {
  it('source_backed profile 不声明第二套知识覆盖模式', () => {
    for (const config of listProfileConfigs()) {
      if (config.projectionMode === 'source_backed') {
        expect(config.presentation).not.toHaveProperty('knowledgeCoverageMode');
      }
    }
  });
});
