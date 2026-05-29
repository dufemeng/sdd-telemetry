import { useMemo, useState, type MouseEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BookOpen, FileStack, FileText, GitBranch, Search, UsersRound } from 'lucide-react';
import type { SddWorkItemDetail, WikiRecallRow } from '@sdd-telemetry/api';
import type { TimeRange } from '@/components/layout/TopBar';
import { DataTable, type DataTableRow } from '@/components/ui/DataTable';
import { Panel } from '@/components/ui/Panel';
import { RowInspectorDrawer, type RowInspectorField } from '@/components/ui/RowInspectorDrawer';
import { formatInteger, formatTime } from '@/lib/format';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { useSddWorkItemDetail } from '../../work-items/useSddWorkItems';
import { useWikiRecallList, useWikiRecallWorkItemRanking } from '../useWikiRecalls';
import { QueryNotice, SoftBadge } from '../components/WikiRecallControls';

const CORE_STAGES = ['proposal', 'design', 'task', 'review'];

export function WorkItemRankingTab({ range }: { range: TimeRange }) {
  const [params, setParams] = useSearchParams();
  const [businessDomain, setBusinessDomain] = useState('');
  const debouncedDomain = useDebouncedValue(businessDomain.trim(), 300);
  const selectedWorkItemId = params.get('workItemId');
  const detailQuery = useSddWorkItemDetail(selectedWorkItemId);
  const detail = detailQuery.data;
  const filters = useMemo(
    () => (debouncedDomain ? { businessDomain: debouncedDomain } : {}),
    [debouncedDomain],
  );
  const { data, isLoading, error } = useWikiRecallWorkItemRanking(range, filters);

  const openWorkItem = (workItemId: string) => {
    const next = new URLSearchParams(params);
    next.set('workItemId', workItemId);
    setParams(next, { replace: true });
  };

  const closeWorkItem = () => {
    const next = new URLSearchParams(params);
    next.delete('workItemId');
    setParams(next, { replace: true });
  };

  const handleSlugClick = (event: MouseEvent<HTMLButtonElement>, workItemId: string) => {
    event.stopPropagation();
    openWorkItem(workItemId);
  };

  const drawerFields: RowInspectorField[] = detail
    ? [
        { label: '业务域', value: detail.businessDomain ?? '—' },
        { label: '需求库', value: detail.requirementsRepoName ?? '—' },
        { label: '相对路径', value: detail.relativeDir, mono: true },
        { label: '首次活跃', value: formatTime(detail.firstSeenAt) },
        { label: '最近活跃', value: formatTime(detail.lastSeenAt) },
        { label: '调用次数', value: `${formatInteger(detail.usageCount)} 次`, mono: true },
        {
          label: '错误数',
          value:
            detail.errorCount > 0 ? (
              <span style={{ color: 'var(--color-bad-text)' }}>{detail.errorCount}</span>
            ) : (
              '0'
            ),
        },
      ]
    : [];

  const rows: DataTableRow[] =
    data?.items.map((row) => ({
      key: row.workItemId,
      ariaLabel: `查看需求 ${row.workItemSlug} 的 wiki 召回`,
      cells: [
        <div className="min-w-[220px]" key="item">
          <button
            type="button"
            onClick={(event) => handleSlugClick(event, row.workItemId)}
            className="block w-full truncate bg-transparent p-0 text-left text-[13px] font-medium text-[#f5f5f5] hover:text-[var(--color-primary)]"
          >
            {row.workItemSlug}
          </button>
          <span className="block truncate text-[10px] text-[var(--color-muted)]">
            {row.workItemId}
          </span>
        </div>,
        row.businessDomain ? (
          <SoftBadge key="domain">{row.businessDomain}</SoftBadge>
        ) : (
          <span key="domain" className="text-[var(--color-muted)]">—</span>
        ),
        <NumberCell key="total" value={row.totalRecalls} />,
        <NumberCell key="domains" value={row.distinctDomains} />,
        <NumberCell key="systems" value={row.distinctSystems} />,
        <div className="flex min-w-[70px] items-center justify-end gap-1" key="users">
          <UsersRound size={13} className="text-[var(--color-muted)]" />
          <span className="text-[13px] text-[#f5f5f5]">{formatInteger(row.userCount)}</span>
        </div>,
      ],
    })) ?? [];

  return (
    <Panel title="需求 × wiki 下钻" icon={<FileStack size={18} />}>
      <div className="grid gap-3">
        <div
          className="flex h-[30px] w-full max-w-[260px] items-center gap-2 rounded-[4px] px-[10px]"
          style={{ border: '1px solid rgba(255,255,255,0.10)', background: 'var(--color-base)' }}
        >
          <Search size={13} className="shrink-0 text-[var(--color-muted)]" />
          <input
            value={businessDomain}
            onChange={(event) => setBusinessDomain(event.target.value)}
            placeholder="筛选业务域，如 cashier"
            className="w-full bg-transparent text-[12px] text-[var(--color-text)] outline-none placeholder:text-[var(--color-muted)]"
          />
        </div>

        <QueryNotice loading={isLoading} error={error} loadingText="正在加载需求排行..." />
        <DataTable
          headers={['需求 slug', '业务域', '召回', 'domains', 'systems', '参与人']}
          rows={rows}
          emptyText="暂无需求 wiki 召回数据"
          selectedRowKey={selectedWorkItemId}
          onRowSelect={(rowKey) => openWorkItem(String(rowKey))}
        />
        {data ? (
          <div className="flex items-center gap-2 text-[11px] text-[var(--color-muted)]">
            <GitBranch size={12} />
            <span>当前条件共 {formatInteger(data.total)} 个需求</span>
          </div>
        ) : null}
      </div>

      {selectedWorkItemId ? (
        <RowInspectorDrawer
          open
          onOpenChange={(open) => {
            if (!open) closeWorkItem();
          }}
          title={detail?.workItemTitle ?? detail?.workItemSlug ?? selectedWorkItemId}
          subtitle={detail?.workItemKey}
          icon={<GitBranch size={18} />}
          badge={
            detail ? (
              <span
                className="rounded-full px-2 py-[2px] text-[11px]"
                style={{
                  color: 'var(--color-secondary)',
                  border: '1px solid var(--color-border)',
                  background: 'rgba(255,255,255,0.04)',
                }}
              >
                {countCoreStages(detail.coverageStages)} / 4 阶段
              </span>
            ) : null
          }
          row={detail ?? { id: selectedWorkItemId }}
          fields={drawerFields}
          rawData={detail ?? { id: selectedWorkItemId }}
          loading={detailQuery.isLoading}
          error={
            detailQuery.error
              ? `需求详情加载失败：${detailQuery.error instanceof Error ? detailQuery.error.message : String(detailQuery.error)}`
              : null
          }
        >
          {detail ? (
            <>
              <WorkItemWikiRecallPanel workItemId={detail.id} range={range} />
              {detail.artifacts.length > 0 ? <WorkItemArtifactsPanel detail={detail} /> : null}
            </>
          ) : null}
        </RowInspectorDrawer>
      ) : null}
    </Panel>
  );
}

function NumberCell({ value }: { value: number }) {
  return (
    <div className="min-w-[72px] text-right text-[13px] text-[#f5f5f5]">
      {formatInteger(value)}
    </div>
  );
}

function WorkItemWikiRecallPanel({ workItemId, range }: { workItemId: string; range: TimeRange }) {
  const filters = useMemo(() => ({ workItemId }), [workItemId]);
  const { data, isLoading, error } = useWikiRecallList(range, filters);
  const groups = useMemo(() => groupRecallsBySkill(data?.items ?? []), [data?.items]);

  return (
    <section className="px-5 pb-4">
      <div
        className="mb-3 flex items-center gap-2 pb-2"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <BookOpen size={14} style={{ color: 'var(--color-primary)' }} />
        <span className="text-[12px] font-semibold text-[#f5f5f5]">wiki 召回</span>
        {data ? <span className="text-[11px] text-[var(--color-muted)]">· {data.total} 条</span> : null}
      </div>

      {isLoading ? <div className="text-[12px] text-[var(--color-muted)]">正在加载召回...</div> : null}
      {error ? (
        <div className="text-[12px] text-[#f87171]">
          召回加载失败：{error instanceof Error ? error.message : String(error)}
        </div>
      ) : null}
      {!isLoading && !error && groups.length === 0 ? (
        <div className="text-[12px] text-[var(--color-muted)]">该需求在当前时间范围内无 wiki 召回</div>
      ) : null}

      <div className="grid gap-3">
        {groups.map(([skillUsageId, recalls]) => (
          <div key={skillUsageId} className="grid gap-[5px]">
            <div
              className="text-[11px] text-[var(--color-muted)]"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              skill_usage: {skillUsageId}
            </div>
            {recalls.slice(0, 12).map((recall) => (
              <div
                key={recall.id}
                className="grid items-center gap-2 rounded-[4px] px-2 py-[6px] hover:bg-[#171717]"
                style={{ gridTemplateColumns: '1fr 64px 72px' }}
              >
                <span
                  className="truncate text-[12px] text-[var(--color-secondary)]"
                  style={{ fontFamily: 'var(--font-mono)' }}
                  title={recall.wikiRelativePath ?? recall.rawPath}
                >
                  {recall.wikiRelativePath ?? recall.rawPath}
                </span>
                <span className="text-[11px] text-[var(--color-muted)]">{recall.actionType}</span>
                <span className="text-right text-[11px] text-[var(--color-muted)]">
                  {formatTime(recall.eventTime)}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function WorkItemArtifactsPanel({ detail }: { detail: SddWorkItemDetail }) {
  return (
    <section className="px-5 pb-4">
      <div
        className="mb-3 flex items-center gap-2 pb-2"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <FileText size={14} style={{ color: 'var(--color-primary)' }} />
        <span className="text-[12px] font-semibold text-[#f5f5f5]">Artifacts</span>
        <span className="text-[11px] text-[var(--color-muted)]">· {detail.artifacts.length} 篇</span>
      </div>
      <div className="grid gap-[4px]">
        {detail.artifacts
          .slice()
          .sort((a, b) => (b.lastSeenAt ?? '').localeCompare(a.lastSeenAt ?? ''))
          .slice(0, 50)
          .map((artifact) => (
            <div
              key={artifact.id}
              className="flex items-center gap-2 rounded-[4px] px-2 py-[5px] transition-colors hover:bg-[#171717]"
            >
              <span
                className="w-[64px] shrink-0 rounded-[3px] px-[6px] py-[1px] text-center text-[10px] font-medium"
                style={{ color: 'var(--color-secondary)', background: 'rgba(255,255,255,0.06)' }}
              >
                {artifact.artifactType}
              </span>
              <span
                className="flex-1 truncate text-[12px] text-[var(--color-secondary)]"
                style={{ fontFamily: 'var(--font-mono)' }}
                title={artifact.artifactRelativePath}
              >
                {artifact.artifactRelativePath}
              </span>
              <span className="w-[64px] shrink-0 text-right text-[11px] text-[var(--color-muted)]">
                {artifact.systemModule ?? '—'}
              </span>
              <span
                className="w-[48px] shrink-0 text-right text-[11px] text-[var(--color-muted)]"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {artifact.lastSeenAt ? formatTime(artifact.lastSeenAt).slice(5) : '—'}
              </span>
            </div>
          ))}
      </div>
    </section>
  );
}

function groupRecallsBySkill(items: WikiRecallRow[]): Array<[string, WikiRecallRow[]]> {
  const groups = new Map<string, WikiRecallRow[]>();
  for (const item of items) {
    const key = item.skillUsageId ?? 'unattached';
    const rows = groups.get(key) ?? [];
    rows.push(item);
    groups.set(key, rows);
  }
  return [...groups.entries()];
}

function countCoreStages(coverageStages: string[]): number {
  return CORE_STAGES.filter((stage) => coverageStages.includes(stage)).length;
}
