export interface EnqueueCleanBatchInput {
  batchId: string;
}

export interface QueuePort {
  enqueueCleanBatch(input: EnqueueCleanBatchInput): Promise<void>;
}
