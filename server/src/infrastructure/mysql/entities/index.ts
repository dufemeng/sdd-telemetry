export * from './ingest-outbox.entity';
export * from './otel-ingest-batch.entity';
export * from './otel-log-event.entity';
export * from './otel-raw-payload.entity';
export * from './sdd-error.entity';
export * from './sdd-interaction-text.entity';
export * from './sdd-interaction.entity';
export * from './sdd-skill-alias.entity';
export * from './sdd-skill-semantic.entity';
export * from './sdd-skill-usage.entity';
export * from './sdd-user.entity';
export * from './sdd-work-item-artifact.entity';
export * from './sdd-work-item.entity';

import { IngestOutboxEntity } from './ingest-outbox.entity';
import { OtelIngestBatchEntity } from './otel-ingest-batch.entity';
import { OtelLogEventEntity } from './otel-log-event.entity';
import { OtelRawPayloadEntity } from './otel-raw-payload.entity';
import { SddErrorEntity } from './sdd-error.entity';
import { SddInteractionTextEntity } from './sdd-interaction-text.entity';
import { SddInteractionEntity } from './sdd-interaction.entity';
import { SddSkillAliasEntity } from './sdd-skill-alias.entity';
import { SddSkillSemanticEntity } from './sdd-skill-semantic.entity';
import { SddSkillUsageEntity } from './sdd-skill-usage.entity';
import { SddUserEntity } from './sdd-user.entity';
import { SddWorkItemArtifactEntity } from './sdd-work-item-artifact.entity';
import { SddWorkItemEntity } from './sdd-work-item.entity';

export const appEntities = [
  SddUserEntity,
  SddSkillSemanticEntity,
  SddSkillAliasEntity,
  OtelIngestBatchEntity,
  OtelRawPayloadEntity,
  IngestOutboxEntity,
  OtelLogEventEntity,
  SddInteractionEntity,
  SddInteractionTextEntity,
  SddSkillUsageEntity,
  SddWorkItemEntity,
  SddWorkItemArtifactEntity,
  SddErrorEntity,
];
