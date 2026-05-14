import { Column, Entity, Index } from 'typeorm';
import { NullableDateColumn, TimestampedEntity, nullableJsonColumn } from './common';

@Entity({ name: 'sdd_users' })
@Index('uk_sdd_users_user_key', ['userKey'], { unique: true })
@Index('idx_sdd_users_install_id', ['installId'])
@Index('idx_sdd_users_machine_id', ['machineId'])
@Index('idx_sdd_users_first_seen_at', ['firstSeenAt'])
@Index('idx_sdd_users_last_seen_at', ['lastSeenAt'])
export class SddUserEntity extends TimestampedEntity {
  @Column({ name: 'user_key', type: 'varchar', length: 191 })
  userKey!: string;

  @Column({ name: 'install_id', type: 'varchar', length: 191, nullable: true })
  installId!: string | null;

  @Column({ name: 'user_name', type: 'varchar', length: 191, nullable: true })
  userName!: string | null;

  @Column({ name: 'machine_id', type: 'varchar', length: 191, nullable: true })
  machineId!: string | null;

  @Column({ name: 'machine_name', type: 'varchar', length: 191, nullable: true })
  machineName!: string | null;

  @Column({ name: 'os_name', type: 'varchar', length: 64, nullable: true })
  osName!: string | null;

  @Column({ name: 'os_version', type: 'varchar', length: 64, nullable: true })
  osVersion!: string | null;

  @Column({ name: 'client_name', type: 'varchar', length: 64, nullable: true })
  clientName!: string | null;

  @Column({ name: 'client_version', type: 'varchar', length: 64, nullable: true })
  clientVersion!: string | null;

  @Column({ name: 'requirements_root_path', type: 'varchar', length: 1024, nullable: true })
  requirementsRootPath!: string | null;

  @Column({ name: 'wiki_root_path', type: 'varchar', length: 1024, nullable: true })
  wikiRootPath!: string | null;

  @Column({ name: 'settings_json', ...nullableJsonColumn })
  settingsJson!: Record<string, unknown> | null;

  @NullableDateColumn('settings_reported_at')
  settingsReportedAt!: Date | null;

  @NullableDateColumn('first_seen_at')
  firstSeenAt!: Date | null;

  @NullableDateColumn('last_seen_at')
  lastSeenAt!: Date | null;
}
