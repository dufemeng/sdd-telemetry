import { describe, expect, it } from 'vitest';
import { createIdRegistry } from '../src/jobs/profile-projection/runner';
import type { ProjectionIdRegistry } from '../src/jobs/profile-projection/runner';

function mapId(map: Map<number, number>, sourceId: number | null): number | null {
  if (sourceId == null) return null;
  return map.get(sourceId) ?? null;
}

describe('delivery_unit_id 映射逻辑', () => {
  it('deliveryUnit 先建 registry，capability 能映射 delivery_unit_id', () => {
    const registry = createIdRegistry();
    registry.deliveryUnitByWorkItemId.set(100, 200);
    registry.deliveryUnitByWorkItemId.set(101, 201);

    const du = mapId(registry.deliveryUnitByWorkItemId, 100);
    expect(du).toBe(200);

    const nullWorkItem = mapId(registry.deliveryUnitByWorkItemId, null);
    expect(nullWorkItem).toBeNull();

    const unknown = mapId(registry.deliveryUnitByWorkItemId, 999);
    expect(unknown).toBeNull();
  });

  it('capability 无 work_item_id 时 delivery_unit_id 为空', () => {
    const registry = createIdRegistry();
    registry.deliveryUnitByWorkItemId.set(100, 200);

    expect(mapId(registry.deliveryUnitByWorkItemId, null)).toBeNull();
  });

  it('knowledge 三跳链路: source_ref -> tool_call -> skill_usage -> work_item -> delivery_unit', () => {
    const registry = createIdRegistry();
    registry.deliveryUnitByWorkItemId.set(10, 100);
    registry.capabilityUsageBySkillUsageId.set(5, 50);

    const workItemId = 10;
    const deliveryUnitId = mapId(registry.deliveryUnitByWorkItemId, workItemId);
    expect(deliveryUnitId).toBe(100);

    const capabilityUsageId = mapId(registry.capabilityUsageBySkillUsageId, 5);
    expect(capabilityUsageId).toBe(50);
  });

  it('knowledge 无 tool_call / 无 skill_usage 时 delivery_unit_id 为空', () => {
    const registry = createIdRegistry();
    registry.deliveryUnitByWorkItemId.set(10, 100);

    expect(mapId(registry.deliveryUnitByWorkItemId, null)).toBeNull();
    expect(mapId(registry.capabilityUsageBySkillUsageId, null)).toBeNull();
  });

  it('code 同样三跳链路，unmapped 只报告不阻塞', () => {
    const registry = createIdRegistry();
    registry.deliveryUnitByWorkItemId.set(10, 100);

    const deliveryUnitId = mapId(registry.deliveryUnitByWorkItemId, 10);
    expect(deliveryUnitId).toBe(100);

    const unmapped = mapId(registry.deliveryUnitByWorkItemId, 999);
    expect(unmapped).toBeNull();
  });
});

describe('bridge operator 顺序依赖', () => {
  it('deliveryUnit 必须先于 capability', () => {
    const registry = createIdRegistry();

    registry.deliveryUnitByWorkItemId.set(1, 10);
    expect(mapId(registry.deliveryUnitByWorkItemId, 1)).toBe(10);

    registry.capabilityUsageBySkillUsageId.set(2, 20);
    expect(mapId(registry.capabilityUsageBySkillUsageId, 2)).toBe(20);
  });

  it('artifact 依赖 deliveryUnit registry', () => {
    const registry = createIdRegistry();
    registry.deliveryUnitByWorkItemId.set(1, 10);
    registry.artifactByArtifactId.set(5, 50);

    expect(mapId(registry.deliveryUnitByWorkItemId, 1)).toBe(10);
    expect(mapId(registry.artifactByArtifactId, 5)).toBe(50);
  });

  it('writes/turns 依赖三者 registry', () => {
    const registry = createIdRegistry();
    registry.deliveryUnitByWorkItemId.set(1, 10);
    registry.capabilityUsageBySkillUsageId.set(2, 20);
    registry.artifactByArtifactId.set(5, 50);

    expect(mapId(registry.deliveryUnitByWorkItemId, 1)).toBe(10);
    expect(mapId(registry.capabilityUsageBySkillUsageId, 2)).toBe(20);
    expect(mapId(registry.artifactByArtifactId, 5)).toBe(50);
  });
});
