export interface CleanBatchJob {
  batchId: string;
}

export async function cleanBatch(job: CleanBatchJob): Promise<void> {
  void job;
}
