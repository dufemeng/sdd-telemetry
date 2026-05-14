import { Column, CreateDateColumn, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export abstract class IdEntity {
  @PrimaryGeneratedColumn('increment', {
    type: 'bigint',
    unsigned: true,
    name: 'id',
  })
  id!: string;
}

export abstract class TimestampedEntity extends IdEntity {
  @CreateDateColumn({
    name: 'created_at',
    type: 'datetime',
    precision: 3,
  })
  createdAt!: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'datetime',
    precision: 3,
  })
  updatedAt!: Date;
}

export const nullableJsonColumn = {
  type: 'json' as const,
  nullable: true,
};

export const nullableLongTextColumn = {
  type: 'longtext' as const,
  nullable: true,
};

export function NullableDateColumn(name: string): PropertyDecorator {
  return Column({
    name,
    type: 'datetime',
    precision: 3,
    nullable: true,
  });
}
