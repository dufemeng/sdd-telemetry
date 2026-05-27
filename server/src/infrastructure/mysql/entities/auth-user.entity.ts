import { Column, Entity, Index } from 'typeorm';
import type { AuthRole, AuthUserStatus } from '@sdd-telemetry/api';
import { NullableDateColumn, TimestampedEntity } from './common';

@Entity({ name: 'auth_users' })
@Index('uk_auth_users_username', ['username'], { unique: true })
@Index('idx_auth_users_role_status', ['role', 'status'])
export class AuthUserEntity extends TimestampedEntity {
  @Column({ name: 'username', type: 'varchar', length: 64 })
  username!: string;

  @Column({ name: 'display_name', type: 'varchar', length: 64 })
  displayName!: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash!: string;

  @Column({ name: 'role', type: 'varchar', length: 32, default: 'viewer' })
  role!: AuthRole;

  @Column({ name: 'status', type: 'varchar', length: 32, default: 'active' })
  status!: AuthUserStatus;

  @Column({ name: 'session_version', type: 'int', unsigned: true, default: 1 })
  sessionVersion!: number;

  @NullableDateColumn('last_login_at')
  lastLoginAt!: Date | null;

  @Column({ name: 'created_by', type: 'bigint', unsigned: true, nullable: true })
  createdBy!: string | null;
}
