import { Column, Entity, Index } from 'typeorm';
import { TimestampedEntity, nullableJsonColumn } from './common';

@Entity({ name: 'sdd_interaction_tool_calls' })
@Index('uk_sdd_interaction_tool_calls_tool_use_id', ['toolUseId'], {
  unique: true,
})
@Index('idx_sdd_interaction_tool_calls_interaction_id', ['interactionId'])
@Index('idx_sdd_interaction_tool_calls_tool_name', ['toolName'])
@Index('idx_sdd_interaction_tool_calls_interaction_sequence', ['interactionId', 'sequence'])
export class SddInteractionToolCallEntity extends TimestampedEntity {
  @Column({ name: 'interaction_id', type: 'bigint', unsigned: true })
  interactionId!: string;

  @Column({ name: 'tool_use_id', type: 'varchar', length: 191 })
  toolUseId!: string;

  @Column({ name: 'tool_name', type: 'varchar', length: 128 })
  toolName!: string;

  @Column({ name: 'sequence', type: 'int', unsigned: true })
  sequence!: number;

  @Column({ name: 'decision', type: 'varchar', length: 16, nullable: true })
  decision!: string | null;

  @Column({
    name: 'decision_source',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  decisionSource!: string | null;

  @Column({ name: 'success', type: 'tinyint', width: 1, nullable: true })
  success!: boolean | null;

  @Column({ name: 'duration_ms', type: 'int', unsigned: true, nullable: true })
  durationMs!: number | null;

  @Column({
    name: 'input_size_bytes',
    type: 'int',
    unsigned: true,
    nullable: true,
  })
  inputSizeBytes!: number | null;

  @Column({
    name: 'result_size_bytes',
    type: 'int',
    unsigned: true,
    nullable: true,
  })
  resultSizeBytes!: number | null;

  @Column({ name: 'error_type', type: 'varchar', length: 128, nullable: true })
  errorType!: string | null;

  @Column({ name: 'tool_input_preview', type: 'text', nullable: true })
  toolInputPreview!: string | null;

  @Column({
    name: 'mcp_server_scope',
    type: 'varchar',
    length: 191,
    nullable: true,
  })
  mcpServerScope!: string | null;

  @Column({ name: 'evidence_json', ...nullableJsonColumn })
  evidenceJson!: Record<string, unknown> | null;
}
