import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Braces, Clock3, FileWarning, MessageSquareWarning, TriangleAlert, Wrench } from 'lucide-react';
import type { ProfileErrorDetail } from '@sdd-telemetry/api';
import { FeatureGate } from '@/components/profiles/FeatureGate';
import { useShellContext } from '@/components/layout/useShellContext';
import { EmptyState } from '@/components/ui/EmptyState';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useProfileErrorDetail } from '@/pages/profiles/useProfiles';
import { formatDateTime, lastTwoPathSegments, truncateId } from '@/lib/format';
import {
  ERROR_CATEGORY_DESCRIPTIONS,
  ERROR_CATEGORY_ICONS,
  buildErrorCategoryPath,
  errorCategoryLabel,
} from './errorMeta';
import { useBackNavigate } from '@/lib/useBackNavigate';

export default function ErrorEventPage() {
  const navigate = useNavigate();
  const goBack = useBackNavigate('/sdd/errors');
  const { eventId = '' } = useParams();
  const { profileId, timeRange } = useShellContext();
  const detailQuery = useProfileErrorDetail(profileId, eventId || null);
  const detail = detailQuery.data;

  if (detailQuery.isLoading) {
    return <main className="p-4 text-[13px] text-[var(--color-muted)]">加载中...</main>;
  }

  if (!detail) {
    return (
      <main className="p-4">
        <EmptyState text="异常事件不存在" />
      </main>
    );
  }

  const Icon = ERROR_CATEGORY_ICONS[detail.category];
  const contextFields: DetailField[] = [
    ['发生时间', formatDateTime(detail.eventTime)],
    ['用户', detail.userName ?? detail.userId],
    ['交互', idLabel(detail.interactionId)],
    ['Session', idLabel(detail.sessionId)],
    ['Prompt', idLabel(detail.promptId)],
    ['需求', detail.deliveryUnitTitle ?? idLabel(detail.deliveryUnitId)],
    ['Capability usage', idLabel(detail.capabilityUsageId)],
  ];
  const toolFields: DetailField[] = [
    ['工具', detail.toolName],
    ['错误类型', detail.errorType],
    ['Tool call', idLabel(detail.toolCallId)],
    ['SDD error', idLabel(detail.sddErrorId)],
    ['Event ID', detail.eventId],
    ['Message hash', detail.errorMessageHash],
  ];
  const attributionFields: DetailField[] = [
    ['分类', errorCategoryLabel(detail.category)],
    ['来源', sourceKindLabel(detail.sourceKind)],
    ['Source scope', detail.sourceScope],
    ['Source category', detail.sourceCategory],
    ['Matched rule', detail.matchedRuleId],
    ['Confidence', detail.confidence],
  ];
  const hasEvidence = Boolean(detail.messagePreview || detail.inputPreview || detail.locator || detail.stackPreview);

  return (
    <FeatureGate capability="errors" fallback={<main className="p-4"><EmptyState text="当前工作流未启用异常分析" /></main>}>
      <main className="min-w-0 space-y-4 p-4">
        <header className="rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface)] p-[14px]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => navigate(buildErrorCategoryPath(detail.category))}
              className="inline-flex items-center gap-1 text-[12px] text-[var(--color-muted)] hover:text-[var(--color-secondary)]"
            >
              <ArrowLeft size={14} /> {errorCategoryLabel(detail.category)}
            </button>
            <span className="text-[11px] text-[var(--color-muted)]">{timeRange}</span>
          </div>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 gap-3">
              <div className="grid h-11 w-11 flex-none place-items-center rounded-[5px] border border-[rgba(250,255,105,0.18)] bg-[#202016] text-[var(--color-primary)]">
                <Icon size={20} />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[18px] font-semibold leading-7 text-[#f5f5f5]">
                    {detail.errorType ?? detail.displayName}
                  </h2>
                  <StatusBadge status={detail.severity} variant={severityVariant(detail.severity)} />
                </div>
                <p className="mt-1 max-w-[840px] text-[12px] leading-5 text-[var(--color-secondary)]">
                  {detail.messagePreview ?? ERROR_CATEGORY_DESCRIPTIONS[detail.category]}
                </p>
              </div>
            </div>
            <div className="text-right text-[11px] text-[var(--color-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
              <div>{formatDateTime(detail.eventTime)}</div>
              <div className="mt-1">#{truncateId(detail.id)}</div>
            </div>
          </div>
        </header>

        <section className="grid gap-px overflow-hidden rounded-[6px] border border-[var(--color-border)] bg-[var(--color-border)] md:grid-cols-3">
          <TracePill label="分类" value={errorCategoryLabel(detail.category)} />
          <TracePill label="工具" value={detail.toolName ?? '—'} />
          <TracePill label="证据定位" value={detail.locator ? lastTwoPathSegments(detail.locator) : '—'} title={detail.locator ?? undefined} />
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 space-y-4">
            <Panel title="失败证据" icon={<MessageSquareWarning size={16} />}>
              {hasEvidence ? (
                <div className="space-y-3">
                  <EvidenceBlock title="错误摘要" value={detail.messagePreview} />
                  <EvidenceBlock title="工具输入" value={detail.inputPreview} />
                  <EvidenceBlock title="定位" value={detail.locator} displayValue={detail.locator ? lastTwoPathSegments(detail.locator) : null} />
                  <EvidenceBlock title="Stack" value={detail.stackPreview} />
                </div>
              ) : (
                <EmptyState text="这条异常没有可展示的摘要证据" />
              )}
            </Panel>

            <Panel title="原始 Evidence" icon={<Braces size={16} />}>
              <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap break-words rounded-[4px] border border-[var(--color-border)] bg-[#111] p-3 text-[11px] leading-5 text-[var(--color-secondary)]">
                {formatEvidence(detail.evidence)}
              </pre>
            </Panel>
          </div>

          <aside className="min-w-0 space-y-4">
            <Panel title="事件上下文" icon={<Clock3 size={16} />}>
              <DetailGrid fields={contextFields} />
            </Panel>

            <Panel title="工具与错误" icon={<Wrench size={16} />}>
              <DetailGrid fields={toolFields} />
            </Panel>

            <Panel title="归因证据" icon={<FileWarning size={16} />}>
              <DetailGrid fields={attributionFields} />
            </Panel>

            <button
              type="button"
              onClick={goBack}
              className="inline-flex h-8 w-full items-center justify-center gap-2 rounded-[4px] border border-[var(--color-border)] bg-[#141414] text-[12px] text-[var(--color-secondary)] hover:text-[#f5f5f5]"
            >
              <TriangleAlert size={14} /> 返回
            </button>
          </aside>
        </section>
      </main>
    </FeatureGate>
  );
}

type DetailField = [label: string, value: React.ReactNode];

function TracePill({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="min-w-0 bg-[var(--color-surface)] p-3">
      <span className="text-[11px] text-[var(--color-muted)]">{label}</span>
      <strong
        title={title ?? value}
        className="mt-1 block truncate text-[13px] font-semibold text-[#f5f5f5]"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {value}
      </strong>
    </div>
  );
}

function DetailGrid({ fields }: { fields: DetailField[] }) {
  return (
    <dl className="divide-y divide-[var(--color-border)]">
      {fields.map(([label, value]) => (
        <div key={label} className="grid grid-cols-[116px_minmax(0,1fr)] gap-3 py-2 first:pt-0 last:pb-0">
          <dt className="text-[11px] leading-5 text-[var(--color-muted)]">{label}</dt>
          <dd className="min-w-0 break-words text-[12px] leading-5 text-[var(--color-secondary)]" style={{ fontFamily: 'var(--font-mono)' }}>
            {value ?? '—'}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function EvidenceBlock({
  title,
  value,
  displayValue,
}: {
  title: string;
  value: string | null | undefined;
  displayValue?: string | null;
}) {
  if (!value) return null;
  return (
    <div>
      <h3 className="mb-1 text-[12px] font-medium text-[#f5f5f5]">{title}</h3>
      <pre
        title={value}
        className="max-h-[220px] overflow-auto whitespace-pre-wrap break-words rounded-[4px] border border-[var(--color-border)] bg-[#111] p-3 text-[11px] leading-5 text-[var(--color-secondary)]"
      >
        {displayValue ?? value}
      </pre>
    </div>
  );
}

function idLabel(value: string | null | undefined): string {
  return value ? truncateId(value) : '—';
}

function sourceKindLabel(value: ProfileErrorDetail['sourceKind']): string {
  return value === 'tool_call' ? '工具调用' : '模型/API 错误';
}

function formatEvidence(value: Record<string, unknown>): string {
  return JSON.stringify(value ?? {}, null, 2);
}

function severityVariant(value: string | null | undefined): 'bad' | 'warn' | 'neutral' {
  if (value === 'error') return 'bad';
  if (value === 'warning') return 'warn';
  return 'neutral';
}
