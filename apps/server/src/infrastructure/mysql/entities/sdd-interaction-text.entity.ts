import { Column, Entity, Index } from 'typeorm';
import { TimestampedEntity, nullableLongTextColumn } from './common';

@Entity({ name: 'sdd_interaction_texts' })
@Index('uk_sdd_interaction_texts_interaction_id', ['interactionId'], { unique: true })
@Index('idx_sdd_interaction_texts_expires_at', ['expiresAt'])
export class SddInteractionTextEntity extends TimestampedEntity {
  @Column({ name: 'interaction_id', type: 'bigint', unsigned: true })
  interactionId!: string;

  @Column({ name: 'prompt_text', ...nullableLongTextColumn })
  promptText!: string | null;

  @Column({ name: 'response_text', ...nullableLongTextColumn })
  responseText!: string | null;

  @Column({ name: 'response_json', ...nullableLongTextColumn })
  responseJson!: string | null;

  @Column({ name: 'expires_at', type: 'datetime', precision: 3 })
  expiresAt!: Date;
}
