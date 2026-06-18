import { describe, expect, it } from 'vitest';
import { listProfileConfigs } from '../src/profile-config/profile-registry';

describe('profile presentation 与 projectionMode 一致性', () => {
  // source_backed 没有文件系统扫描(知识覆盖走召回事实,scan.configured 恒为 false),
  // 所以它的 presentation 必须是 recall_facts;若误用 filesystem_scan,知识库页会永远降级
  // 弹「需服务器挂载知识库」。这条护栏防止该类不一致复发。
  it('source_backed profile 的 knowledgeCoverageMode 必须是 recall_facts', () => {
    for (const config of listProfileConfigs()) {
      if (config.projectionMode === 'source_backed') {
        expect(
          config.presentation?.knowledgeCoverageMode,
          `profile ${config.profileId} 是 source_backed,knowledgeCoverageMode 应为 recall_facts`,
        ).toBe('recall_facts');
      }
    }
  });
});
