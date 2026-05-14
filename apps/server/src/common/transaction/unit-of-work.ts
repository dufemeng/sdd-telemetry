import type { DataSource, EntityManager } from 'typeorm';

export interface TransactionContext {
  readonly id: string;
  readonly manager?: EntityManager;
}

export interface UnitOfWork {
  run<T>(handler: (context: TransactionContext) => Promise<T>): Promise<T>;
}

export class NoopUnitOfWork implements UnitOfWork {
  async run<T>(handler: (context: TransactionContext) => Promise<T>): Promise<T> {
    return handler({ id: 'noop' });
  }
}

export class TypeOrmUnitOfWork implements UnitOfWork {
  constructor(private readonly dataSource: DataSource) {}

  async run<T>(handler: (context: TransactionContext) => Promise<T>): Promise<T> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const result = await handler({
        id: `tx-${Date.now()}`,
        manager: queryRunner.manager,
      });
      await queryRunner.commitTransaction();
      return result;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
