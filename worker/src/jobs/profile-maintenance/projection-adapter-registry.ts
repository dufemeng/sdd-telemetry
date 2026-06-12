import type { Pool } from 'mysql2/promise';
import type {
  ProjectionMode,
  RuntimeResolution,
  WorkflowProfileConfig,
} from '@sdd-telemetry/api';
import { codeOperator } from '../profile-projection/code-operator';
import { knowledgeOperator } from '../profile-projection/knowledge-operator';
import type { ProjectionOperator } from '../profile-projection/runner';
import { SDD_BRIDGE_OPERATORS } from '../profile-projection/sdd-bridge-operators';
import { SOURCE_BACKED_OPERATORS } from '../profile-projection/source-backed-operators';
import { rematchProfileSourceReferences } from './profile-source-matcher';

export interface ProjectionPrepareResult {
  stats?: Record<string, unknown>;
}

export interface ProfileProjectionAdapter {
  mode: ProjectionMode;
  operators: ProjectionOperator[];
  prepare(input: {
    pool: Pool;
    config: WorkflowProfileConfig;
    runtime: RuntimeResolution;
    profileConfigVersionId: string | null;
  }): Promise<ProjectionPrepareResult>;
}

class SddBridgeProjectionAdapter implements ProfileProjectionAdapter {
  mode: ProjectionMode = 'sdd_bridge';
  operators = [...SDD_BRIDGE_OPERATORS, knowledgeOperator, codeOperator];

  async prepare(): Promise<ProjectionPrepareResult> {
    return {};
  }
}

class SourceBackedProjectionAdapter implements ProfileProjectionAdapter {
  mode: ProjectionMode = 'source_backed';
  operators = SOURCE_BACKED_OPERATORS;

  async prepare(input: {
    pool: Pool;
    config: WorkflowProfileConfig;
    runtime: RuntimeResolution;
    profileConfigVersionId: string | null;
  }): Promise<ProjectionPrepareResult> {
    const sourceRematch = await rematchProfileSourceReferences(
      input.pool,
      input.config,
      input.runtime,
      input.profileConfigVersionId,
    );
    return { stats: { sourceRematch } };
  }
}

export class ProfileProjectionAdapterRegistry {
  private readonly adapters: Map<ProjectionMode, ProfileProjectionAdapter>;

  constructor(adapters: ProfileProjectionAdapter[] = [
    new SddBridgeProjectionAdapter(),
    new SourceBackedProjectionAdapter(),
  ]) {
    this.adapters = new Map(adapters.map((adapter) => [adapter.mode, adapter]));
  }

  get(mode: ProjectionMode): ProfileProjectionAdapter {
    const adapter = this.adapters.get(mode);
    if (!adapter) throw new Error(`unsupported projection mode: ${mode}`);
    return adapter;
  }
}

export const profileProjectionAdapterRegistry = new ProfileProjectionAdapterRegistry();
