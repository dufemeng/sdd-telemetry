import { useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  FileText,
  GitBranch,
  TerminalSquare,
  Wrench,
} from 'lucide-react';
import type {
  ProfileExecutionArtifact,
  ProfileExecutionFallback,
  ProfileExecutionKnowledgeAccess,
  ProfileExecutionKnowledgeFailure,
  ProfileExecutionSnapshot,
  ProfileExecutionToolCall,
  SddInteractionItem,
} from '@sdd-telemetry/api';
import { useShellContext } from '@/components/layout/useShellContext';
import { useProfileExecutionSnapshot } from '@/pages/profiles/useProfiles';
import { RowInspectorDrawer } from '@/components/ui/RowInspectorDrawer';
import { DataTable, type DataTableRow } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatDateTime, formatInteger } from '@/lib/format';
import { truncate } from '@/lib/format';
import { WikiDocModal } from './WikiDocModal';

type KnowledgeEvidence =
  | { kind: 'access'; value: ProfileExecutionKnowledgeAccess }
  | { kind: 'failure'; value: ProfileExecutionKnowledgeFailure };

export function InteractionDetailDrawer({
  interactionId,
  open,
  onOpenChange,
  initialRow,
}: {
  interactionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialRow?: SddInteractionItem | null;
}) {
  const { profileId } = useShellContext();
  const snapshotQuery = useProfileExecutionSnapshot(profileId, interactionId);
  const snapshot = snapshotQuery.data;
  const [wikiDocToolCallId, setWikiDocToolCallId] = useState<string | null>(null);

  const title =
    snapshot?.skills[0]?.rawSkillName ??
    snapshot?.interaction.skillName ??
    initialRow?.skillName ??
    snapshot?.interaction.commandName ??
    initialRow?.commandName ??
    (interactionId ? `Interaction ${interactionId}` : '交互详情');
  const status = snapshot?.interaction.status ?? initialRow?.status;
  const sessionId = snapshot?.interaction.sessionId ?? initialRow?.sessionId;

  return (
    <>
      <RowInspectorDrawer
        open={open}
        onOpenChange={onOpenChange}
        title={title}
        subtitle={
          interactionId
            ? `interaction ${interactionId}${sessionId ? ` · ${sessionId}` : ''}`
            : undefined
        }
        icon={<TerminalSquare size={18} />}
        badge={status ? <StatusBadge status={status} /> : null}
        row={snapshot ?? initialRow ?? (interactionId ? { id: interactionId } : null)}
        rawData={snapshot ?? initialRow}
        loading={snapshotQuery.isLoading}
        error={snapshotQuery.error instanceof Error ? snapshotQuery.error.message : null}
        size="xl"
      >
        {snapshot ? (
          <ExecutionSnapshotContent snapshot={snapshot} onOpenWikiDoc={setWikiDocToolCallId} />
        ) : null}
      </RowInspectorDrawer>
      <WikiDocModal
        toolCallId={wikiDocToolCallId}
        open={Boolean(wikiDocToolCallId)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setWikiDocToolCallId(null);
        }}
      />
    </>
  );
}

function ExecutionSnapshotContent({
  snapshot,
  onOpenWikiDoc,
}: {
  snapshot: ProfileExecutionSnapshot;
  onOpenWikiDoc: (toolCallId: string) => void;
}) {
  const skills = snapshot.skills;
  return (
    <div className="space-y-5">
      <ExecutionSummary snapshot={snapshot} />
      <KnowledgeEvidenceSection
        accesses={snapshot.knowledge.accesses}
        failures={snapshot.knowledge.failures}
        onOpenWikiDoc={onOpenWikiDoc}
      />
      <FallbackSection fallbacks={snapshot.fallbacks} />
      <ArtifactSection artifacts={snapshot.artifacts} />
      <ToolCallsSection calls={snapshot.toolCalls} onOpenWikiDoc={onOpenWikiDoc} />
      <details className="group border-t border-[var(--color-border)] pt-3">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-[12px] font-semibold text-[var(--color-secondary)] hover:text-[#f5f5f5]">
          <ChevronDown size={14} className="transition-transform group-open:rotate-180" />
          提示词与回答
        </summary>
        <div className="mt-3 grid gap-3">
          <EvidenceText title="Prompt" value={snapshot.interaction.promptText} />
          <EvidenceText title="Response" value={snapshot.interaction.responseText} />
        </div>
      </details>
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-[var(--color-border)] pt-3 text-[10px] text-[var(--color-muted)]">
        <span>开始 {formatDateTime(snapshot.interaction.startedAt)}</span>
        <span>完成 {formatDateTime(snapshot.interaction.completedAt)}</span>
        <span>模型 {snapshot.interaction.model ?? '—'}</span>
        <span>用户 {snapshot.interaction.userId ?? '—'}</span>
        {skills.length > 1 ? <span>{skills.length} 个 skill usage</span> : null}
      </div>
    </div>
  );
}

function ExecutionSummary({ snapshot }: { snapshot: ProfileExecutionSnapshot }) {
  const primarySkill = snapshot.skills[0];
  const metrics = [
    { label: '知识访问', value: snapshot.summary.knowledgeAccessCount, tone: 'neutral' as const },
    { label: '读取失败', value: snapshot.summary.knowledgeFailureCount, tone: 'bad' as const },
    { label: '降级', value: snapshot.summary.fallbackCount, tone: 'warn' as const },
    { label: '产物写入', value: snapshot.summary.artifactWriteCount, tone: 'neutral' as const },
    { label: '工具调用', value: snapshot.summary.toolCallCount, tone: 'neutral' as const },
  ];

  return (
    <section className="overflow-hidden rounded-[6px] border border-[var(--color-border)] bg-[var(--color-panel)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] px-3 py-2.5">
        <span className="text-[13px] font-semibold text-[#f5f5f5]">执行证据</span>
        {snapshot.skills.map((skill) => (
          <span
            key={skill.id}
            className="inline-flex items-center gap-1 rounded-[4px] bg-[rgba(255,255,255,0.05)] px-2 py-1 text-[10px] text-[var(--color-secondary)]"
          >
            <span>{skill.rawSkillName}</span>
            <span className="font-mono text-[#f5f5f5]">{skill.observedVersion ?? '版本未知'}</span>
          </span>
        ))}
        {!primarySkill ? (
          <span className="text-[10px] text-[var(--color-muted)]">未关联 skill usage</span>
        ) : null}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5">
        {metrics.map((metric) => (
          <SummaryMetric key={metric.label} {...metric} />
        ))}
      </div>
    </section>
  );
}

function SummaryMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'neutral' | 'warn' | 'bad';
}) {
  const color =
    value > 0 && tone === 'bad'
      ? 'var(--color-bad-text)'
      : value > 0 && tone === 'warn'
        ? 'var(--color-warn-text)'
        : '#f5f5f5';
  return (
    <div className="border-b border-r border-[var(--color-border)] px-3 py-2.5 last:border-r-0 sm:border-b-0">
      <div className="text-[10px] text-[var(--color-muted)]">{label}</div>
      <div className="mt-1 font-mono text-[18px] font-semibold" style={{ color }}>
        {formatInteger(value)}
      </div>
    </div>
  );
}

function KnowledgeEvidenceSection({
  accesses,
  failures,
  onOpenWikiDoc,
}: {
  accesses: ProfileExecutionKnowledgeAccess[];
  failures: ProfileExecutionKnowledgeFailure[];
  onOpenWikiDoc: (toolCallId: string) => void;
}) {
  const evidence: KnowledgeEvidence[] = [
    ...accesses.map((value) => ({ kind: 'access' as const, value })),
    ...failures.map((value) => ({ kind: 'failure' as const, value })),
  ].sort(
    (left, right) =>
      (left.value.sequence ?? Number.MAX_SAFE_INTEGER) -
      (right.value.sequence ?? Number.MAX_SAFE_INTEGER),
  );

  return (
    <EvidenceSection
      icon={<BookOpen size={16} />}
      title="知识路径"
      meta={`${accesses.length} 成功 · ${failures.length} 失败`}
    >
      {evidence.length === 0 ? (
        <EmptyEvidence text="本次执行未观测到知识访问或读取失败" />
      ) : (
        <div className="divide-y divide-[var(--color-border)]">
          {evidence.map((item) =>
            item.kind === 'access' ? (
              <KnowledgeAccessRow
                key={`access-${item.value.id}`}
                access={item.value}
                onOpenWikiDoc={onOpenWikiDoc}
              />
            ) : (
              <KnowledgeFailureRow key={`failure-${item.value.id}`} failure={item.value} />
            ),
          )}
        </div>
      )}
    </EvidenceSection>
  );
}

function KnowledgeAccessRow({
  access,
  onOpenWikiDoc,
}: {
  access: ProfileExecutionKnowledgeAccess;
  onOpenWikiDoc: (toolCallId: string) => void;
}) {
  return (
    <div className="flex items-start gap-2 px-3 py-2.5">
      <CheckCircle2 size={14} className="mt-[2px] shrink-0 text-[var(--color-good-text)]" />
      <Sequence value={access.sequence} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-[3px] bg-[rgba(255,255,255,0.05)] px-1.5 py-0.5 text-[10px] text-[var(--color-secondary)]">
            {access.sourceNamespace}
          </span>
          <span className="text-[10px] text-[var(--color-muted)]">{access.actionType}</span>
        </div>
        <div className="mt-1 break-all font-mono text-[11px] leading-[17px] text-[#f5f5f5]">
          {access.relativePath}
        </div>
      </div>
      {access.toolCallId ? (
        <button
          type="button"
          title="查看当前文档内容"
          aria-label={`查看 ${access.relativePath}`}
          onClick={() => onOpenWikiDoc(access.toolCallId as string)}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-[4px] text-[var(--color-muted)] hover:bg-[var(--color-active)] hover:text-[var(--color-primary)]"
        >
          <BookOpen size={13} />
        </button>
      ) : null}
    </div>
  );
}

function KnowledgeFailureRow({ failure }: { failure: ProfileExecutionKnowledgeFailure }) {
  const locator = failure.locator ?? failure.inputPreview ?? '未记录失败路径';
  return (
    <div className="flex items-start gap-2 bg-[var(--color-bad-bg)] px-3 py-2.5">
      <AlertTriangle size={14} className="mt-[2px] shrink-0 text-[var(--color-bad-text)]" />
      <Sequence value={failure.sequence} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
          <span className="font-medium text-[var(--color-bad-text)]">读取失败</span>
          <span className="font-mono text-[var(--color-secondary)]">
            {failure.errorType ?? failure.toolName ?? 'unknown'}
          </span>
        </div>
        <div className="mt-1 break-all font-mono text-[11px] leading-[17px] text-[#f5f5f5]">
          {locator}
        </div>
        {failure.messagePreview ? (
          <div className="mt-1 text-[10px] leading-[16px] text-[var(--color-bad-text)]">
            {truncate(failure.messagePreview, 260)}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function FallbackSection({ fallbacks }: { fallbacks: ProfileExecutionFallback[] }) {
  return (
    <EvidenceSection
      icon={<GitBranch size={16} />}
      title="降级"
      meta={fallbacks.length > 0 ? `${fallbacks.length} 次` : '未检测到'}
    >
      {fallbacks.length === 0 ? (
        <EmptyEvidence text="本次执行未命中 profile fallback rule" />
      ) : (
        <div className="divide-y divide-[var(--color-border)]">
          {fallbacks.map((fallback) => (
            <div
              key={fallback.capabilityUsageId}
              className="flex items-start gap-2 bg-[var(--color-warn-bg)] px-3 py-2.5"
            >
              <AlertTriangle
                size={14}
                className="mt-[2px] shrink-0 text-[var(--color-warn-text)]"
              />
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-medium text-[var(--color-warn-text)]">
                  {fallback.displayName ??
                    fallback.capabilityCode ??
                    fallback.rawCapabilityName ??
                    'Fallback'}
                </div>
                <div className="mt-1 font-mono text-[10px] text-[var(--color-secondary)]">
                  {fallback.rawCapabilityName ?? '—'} · rule {fallback.matchedRuleId}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </EvidenceSection>
  );
}

function ArtifactSection({ artifacts }: { artifacts: ProfileExecutionArtifact[] }) {
  return (
    <EvidenceSection icon={<FileText size={16} />} title="产物写入" meta={`${artifacts.length} 条`}>
      {artifacts.length === 0 ? (
        <EmptyEvidence text="本次 interaction 未观测到产物写入" />
      ) : (
        <div className="divide-y divide-[var(--color-border)]">
          {artifacts.map((artifact) => (
            <div key={artifact.writeId} className="px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-[3px] bg-[rgba(255,255,255,0.05)] px-1.5 py-0.5 text-[10px] text-[var(--color-secondary)]">
                  {artifact.artifactType}
                </span>
                <span className="text-[10px] text-[var(--color-muted)]">
                  {artifact.writeKind ?? 'write'}
                </span>
                <span className="break-all font-mono text-[11px] text-[#f5f5f5]">
                  {artifact.artifactLocator ?? '未记录路径'}
                </span>
              </div>
              {artifact.contentPreview ? (
                <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap break-words rounded-[4px] bg-[var(--color-base)] p-2 font-mono text-[10px] leading-[16px] text-[var(--color-secondary)]">
                  {truncate(artifact.contentPreview, 500)}
                </pre>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </EvidenceSection>
  );
}

function ToolCallsSection({
  calls,
  onOpenWikiDoc,
}: {
  calls: ProfileExecutionToolCall[];
  onOpenWikiDoc: (toolCallId: string) => void;
}) {
  return (
    <EvidenceSection icon={<Wrench size={16} />} title="工具调用时间线" meta={`${calls.length} 条`}>
      <div className="overflow-x-auto">
        <DataTable
          headers={['#', '工具', '知识', '决策', '状态', '耗时', '入参', '结果']}
          rows={calls.map((call) => toToolCallRow(call, onOpenWikiDoc))}
          emptyText="暂无工具调用"
        />
      </div>
    </EvidenceSection>
  );
}

function toToolCallRow(
  call: ProfileExecutionToolCall,
  onOpenWikiDoc: (toolCallId: string) => void,
): DataTableRow {
  return {
    key: call.toolUseId,
    cells: [
      call.sequence,
      call.toolName,
      call.knowledgeStatus === 'accessed' ? (
        <button
          type="button"
          onClick={() => onOpenWikiDoc(call.id)}
          className="inline-flex items-center gap-1 rounded-[4px] bg-[rgba(34,197,94,0.10)] px-2 py-[2px] text-[10px] text-[var(--color-good-text)] hover:brightness-125"
          title="查看当前文档内容"
        >
          <BookOpen size={11} /> 成功
        </button>
      ) : call.knowledgeStatus === 'failed' ? (
        <span className="inline-flex items-center gap-1 rounded-[4px] bg-[var(--color-bad-bg)] px-2 py-[2px] text-[10px] text-[var(--color-bad-text)]">
          <AlertTriangle size={11} /> 失败
        </span>
      ) : (
        '—'
      ),
      call.decision ?? '—',
      call.success == null ? '—' : <StatusBadge status={call.success ? 'success' : 'failed'} />,
      call.durationMs == null ? '—' : `${call.durationMs} ms`,
      truncate(call.toolInputPreview, 120),
      call.resultSizeBytes == null ? '—' : `${formatInteger(call.resultSizeBytes)} B`,
    ],
  };
}

function EvidenceSection({
  icon,
  title,
  meta,
  children,
}: {
  icon: ReactNode;
  title: string;
  meta: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[6px] border border-[var(--color-border)]">
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2">
        <span className="text-[var(--color-primary)]">{icon}</span>
        <h4 className="text-[12px] font-semibold text-[#f5f5f5]">{title}</h4>
        <span className="ml-auto font-mono text-[10px] text-[var(--color-muted)]">{meta}</span>
      </div>
      {children}
    </section>
  );
}

function EmptyEvidence({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-3 text-[11px] text-[var(--color-muted)]">
      {text}
    </div>
  );
}

function Sequence({ value }: { value: number | null }) {
  return (
    <span className="mt-[1px] w-6 shrink-0 text-right font-mono text-[10px] text-[var(--color-muted)]">
      {value == null ? '—' : `#${value}`}
    </span>
  );
}

function EvidenceText({ title, value }: { title: string; value: string | null }) {
  return (
    <section>
      <div className="mb-1 text-[10px] font-semibold text-[var(--color-muted)]">{title}</div>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-[4px] bg-[var(--color-base)] p-3 font-mono text-[11px] leading-[18px] text-[var(--color-secondary)]">
        {value ?? '无内容'}
      </pre>
    </section>
  );
}
