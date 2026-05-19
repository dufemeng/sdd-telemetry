import { Column, Entity, Index } from 'typeorm';
import { NullableDateColumn, TimestampedEntity, nullableJsonColumn } from './common';

@Entity({ name: 'sdd_interactions' })
@Index('uk_sdd_interactions_interaction_key', ['interactionKey'], {
  unique: true,
})
@Index('idx_sdd_interactions_user_id', ['userId'])
@Index('idx_sdd_interactions_session_id', ['sessionId'])
@Index('idx_sdd_interactions_prompt_id', ['promptId'])
@Index('idx_sdd_interactions_started_at', ['startedAt'])
@Index('idx_sdd_interactions_source_batch_id', ['sourceBatchId'])
export class SddInteractionEntity extends TimestampedEntity {
  @Column({ name: 'interaction_key', type: 'char', length: 64 })
  interactionKey!: string;

  @Column({ name: 'user_id', type: 'bigint', unsigned: true, nullable: true })
  userId!: string | null;

  @Column({ name: 'session_id', type: 'varchar', length: 191, nullable: true })
  sessionId!: string | null;

  @Column({ name: 'prompt_id', type: 'varchar', length: 191, nullable: true })
  promptId!: string | null;

  @Column({
    name: 'request_event_id',
    type: 'char',
    length: 64,
    nullable: true,
  })
  requestEventId!: string | null;

  @Column({
    name: 'response_event_id',
    type: 'char',
    length: 64,
    nullable: true,
  })
  responseEventId!: string | null;

  @Column({ name: 'status', type: 'varchar', length: 32 })
  status!: string;

  @Column({ name: 'model', type: 'varchar', length: 128, nullable: true })
  model!: string | null;

  @Column({
    name: 'command_name',
    type: 'varchar',
    length: 191,
    nullable: true,
  })
  commandName!: string | null;

  @Column({
    name: 'command_source',
    type: 'varchar',
    length: 191,
    nullable: true,
  })
  commandSource!: string | null;

  @Column({ name: 'pairing_method', type: 'varchar', length: 64 })
  pairingMethod!: string;

  @NullableDateColumn('started_at')
  startedAt!: Date | null;

  @NullableDateColumn('completed_at')
  completedAt!: Date | null;

  @Column({ name: 'duration_ms', type: 'int', unsigned: true, nullable: true })
  durationMs!: number | null;

  @Column({
    name: 'cost_usd',
    type: 'decimal',
    precision: 10,
    scale: 6,
    nullable: true,
  })
  costUsd!: string | null;

  @Column({ name: 'input_tokens', type: 'int', unsigned: true, nullable: true })
  inputTokens!: number | null;

  @Column({
    name: 'output_tokens',
    type: 'int',
    unsigned: true,
    nullable: true,
  })
  outputTokens!: number | null;

  @Column({
    name: 'cache_read_tokens',
    type: 'int',
    unsigned: true,
    nullable: true,
  })
  cacheReadTokens!: number | null;

  @Column({
    name: 'cache_creation_tokens',
    type: 'int',
    unsigned: true,
    nullable: true,
  })
  cacheCreationTokens!: number | null;

  @Column({
    name: 'llm_call_count',
    type: 'smallint',
    unsigned: true,
    default: 0,
  })
  llmCallCount!: number;

  @Column({
    name: 'tool_call_count',
    type: 'smallint',
    unsigned: true,
    default: 0,
  })
  toolCallCount!: number;

  @Column({ name: 'skill_name', type: 'varchar', length: 191, nullable: true })
  skillName!: string | null;

  @Column({ name: 'agent_name', type: 'varchar', length: 191, nullable: true })
  agentName!: string | null;

  @Column({ name: 'plugin_name', type: 'varchar', length: 191, nullable: true })
  pluginName!: string | null;

  @Column({ name: 'query_source', type: 'varchar', length: 64, nullable: true })
  querySource!: string | null;

  @Column({ name: 'effort', type: 'varchar', length: 16, nullable: true })
  effort!: string | null;

  @Column({ name: 'speed', type: 'varchar', length: 16, nullable: true })
  speed!: string | null;

  @Column({
    name: 'source_batch_id',
    type: 'bigint',
    unsigned: true,
    nullable: true,
  })
  sourceBatchId!: string | null;

  @Column({ name: 'evidence_json', ...nullableJsonColumn })
  evidenceJson!: Record<string, unknown> | null;
}
