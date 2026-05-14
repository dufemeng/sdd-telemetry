import { Column, Entity, Index } from 'typeorm';
import { NullableDateColumn, TimestampedEntity } from './common';

@Entity({ name: 'sdd_work_items' })
@Index('uk_sdd_work_items_work_item_key', ['workItemKey'], { unique: true })
@Index('idx_sdd_work_items_business_domain', ['businessDomain'])
@Index('idx_sdd_work_items_work_item_slug', ['workItemSlug'])
@Index('idx_sdd_work_items_last_seen_at', ['lastSeenAt'])
export class SddWorkItemEntity extends TimestampedEntity {
  @Column({ name: 'work_item_key', type: 'char', length: 64 })
  workItemKey!: string;

  @Column({ name: 'requirements_repo_name', type: 'varchar', length: 191, nullable: true })
  requirementsRepoName!: string | null;

  @Column({ name: 'business_domain', type: 'varchar', length: 191, nullable: true })
  businessDomain!: string | null;

  @Column({ name: 'work_item_slug', type: 'varchar', length: 191 })
  workItemSlug!: string;

  @Column({ name: 'work_item_title', type: 'varchar', length: 500, nullable: true })
  workItemTitle!: string | null;

  @Column({ name: 'relative_dir', type: 'varchar', length: 1024 })
  relativeDir!: string;

  @NullableDateColumn('first_seen_at')
  firstSeenAt!: Date | null;

  @NullableDateColumn('last_seen_at')
  lastSeenAt!: Date | null;
}
