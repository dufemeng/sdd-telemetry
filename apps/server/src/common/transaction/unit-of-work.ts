export interface TransactionContext {
  readonly id: string;
}

export interface UnitOfWork {
  run<T>(handler: (context: TransactionContext) => Promise<T>): Promise<T>;
}

export class NoopUnitOfWork implements UnitOfWork {
  async run<T>(handler: (context: TransactionContext) => Promise<T>): Promise<T> {
    return handler({ id: 'noop' });
  }
}
