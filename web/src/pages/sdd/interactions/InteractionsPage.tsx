import { useMemo, useState } from 'react';
import { ArrowLeftCircle, ArrowRightCircle, TerminalSquare, Wrench, Workflow } from 'lucide-react';
import { useShellContext } from '../../../components/layout/useShellContext';
import {
  useSddInteractionDetail,
  useSddInteractions,
  useSddInteractionToolCalls,
} from './useSddInteractions';
import { Panel } from '../../../components/ui/Panel';
import { DataTable, type DataTableRow } from '../../../components/ui/DataTable';
import {
  RowInspectorDrawer,
  type RowInspectorField,
  type RowInspectorTextBlock,
} from '../../../components/ui/RowInspectorDrawer';
import { Pagination } from '../../../components/ui/Pagination';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import {
  formatTime,
  formatDateTime,
  formatInteger,
  formatUsd,
  truncate,
} from '../../../lib/format';
import { useClientPagination } from '../../../lib/useClientPagination';
import type {
  SddInteractionDetail,
  SddInteractionItem,
  SddInteractionToolCall,
} from '@sdd-telemetry/api';

const PAGE_SIZE = 20;

export default function InteractionsPage() {
  const { timeRange, search } = useShellContext();
  const { data } = useSddInteractions(timeRange);
  const [selectedInteractionId, setSelectedInteractionId] = useState<string | null>(null);
  const detailQuery = useSddInteractionDetail(selectedInteractionId);
  const toolCallsQuery = useSddInteractionToolCalls(selectedInteractionId);

  const filtered = useMemo(
    () =>
      (data ?? []).filter((item) => {
        if (!search) return true;
        const haystack = [
          item.sessionId,
          item.promptId,
          item.userId,
          item.commandName,
          item.skillName,
          item.agentName,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(search.toLowerCase());
      }),
    [data, search],
  );

  const { pageItems, pageNumber, hasNext, hasPrev, goNext, goPrev } = useClientPagination(
    filtered,
    PAGE_SIZE,
  );
  const selectedInteraction = useMemo(
    () => (data ?? []).find((item) => item.id === selectedInteractionId) ?? null,
    [data, selectedInteractionId],
  );
  const inspectorRow = detailQuery.data ?? selectedInteraction;
  const fallbackRow = selectedInteractionId ? { id: selectedInteractionId } : null;

  return (
    <>
      <Panel title="交互明细" icon={<Workflow size={18} />}>
        <div className="grid gap-3">
          <DataTable
            headers={[
              '时间',
              '用户',
              'sessionId',
              'promptId',
              '模型',
              '成本',
              'tokens',
              'LLM 调用',
              '状态',
              '耗时',
              '提示词预览',
              '回答预览',
            ]}
            rows={pageItems.map(toTableRow)}
            selectedRowKey={selectedInteractionId}
            onRowSelect={(rowKey) => setSelectedInteractionId(String(rowKey))}
          />
          <Pagination
            pageNumber={pageNumber}
            pageSize={PAGE_SIZE}
            hasNext={hasNext}
            hasPrev={hasPrev}
            onNext={goNext}
            onPrev={goPrev}
          />
        </div>
      </Panel>

      {selectedInteractionId ? (
        <RowInspectorDrawer
          open={selectedInteractionId !== null}
          onOpenChange={(open) => {
            if (!open) setSelectedInteractionId(null);
          }}
          title={inspectorRow?.interactionKey ?? selectedInteractionId}
          subtitle={
            inspectorRow?.sessionId
              ? `session ${inspectorRow.sessionId}`
              : `row ${selectedInteractionId}`
          }
          icon={<TerminalSquare size={18} />}
          badge={inspectorRow ? <StatusBadge status={inspectorRow.status} /> : null}
          row={inspectorRow ?? fallbackRow}
          overview={inspectorRow ? toOverviewFields(inspectorRow) : []}
          fields={inspectorRow ? toDetailFields(inspectorRow) : []}
          textBlocks={inspectorRow ? toTextBlocks(inspectorRow) : []}
          rawData={inspectorRow ?? fallbackRow}
          loading={detailQuery.isLoading}
          error={detailQuery.error instanceof Error ? detailQuery.error.message : null}
        >
          <ToolCallsSection
            calls={toolCallsQuery.data?.items ?? []}
            loading={toolCallsQuery.isLoading}
            error={toolCallsQuery.error instanceof Error ? toolCallsQuery.error.message : null}
          />
        </RowInspectorDrawer>
      ) : null}
    </>
  );
}

function toTableRow(item: SddInteractionItem): DataTableRow {
  return {
    key: item.id,
    ariaLabel: `查看交互 ${item.id}`,
    cells: [
      formatTime(item.completedAt ?? item.startedAt),
      item.userId ?? '—',
      item.sessionId ?? '—',
      item.promptId ?? '—',
      item.model ?? '—',
      formatUsd(item.costUsd),
      formatTokenPair(item),
      item.llmCallCount && item.llmCallCount > 0 ? formatInteger(item.llmCallCount) : '—',
      <StatusBadge key="s" status={item.status} />,
      item.durationMs == null ? '—' : `${item.durationMs} ms`,
      truncate(item.promptPreview, 140),
      truncate(item.responsePreview, 160),
    ],
  };
}

function toOverviewFields(row: SddInteractionItem | SddInteractionDetail): RowInspectorField[] {
  return [
    { label: 'Status', value: <StatusBadge status={row.status} /> },
    { label: 'Model', value: display(row.model), mono: true },
    { label: 'Cost', value: formatUsd(row.costUsd), mono: true },
    {
      label: 'LLM Calls',
      value: row.llmCallCount && row.llmCallCount > 0 ? formatInteger(row.llmCallCount) : '—',
      mono: true,
    },
    {
      label: 'Duration',
      value: row.durationMs == null ? '—' : `${row.durationMs} ms`,
    },
    {
      label: 'Completed',
      value: formatDateTime(row.completedAt ?? row.startedAt),
    },
  ];
}

function toDetailFields(row: SddInteractionItem | SddInteractionDetail): RowInspectorField[] {
  return [
    { label: 'ID', value: row.id, copyValue: row.id, mono: true },
    {
      label: 'Interaction Key',
      value: row.interactionKey,
      copyValue: row.interactionKey,
      mono: true,
    },
    {
      label: 'User ID',
      value: display(row.userId),
      copyValue: row.userId,
      mono: true,
    },
    {
      label: 'Session ID',
      value: display(row.sessionId),
      copyValue: row.sessionId,
      mono: true,
    },
    {
      label: 'Prompt ID',
      value: display(row.promptId),
      copyValue: row.promptId,
      mono: true,
    },
    {
      label: 'Command',
      value: display(row.commandName),
      copyValue: row.commandName,
      mono: true,
    },
    {
      label: 'Skill',
      value: display(row.skillName),
      copyValue: row.skillName,
      mono: true,
    },
    {
      label: 'Agent',
      value: display(row.agentName),
      copyValue: row.agentName,
      mono: true,
    },
    {
      label: 'Plugin',
      value: display(row.pluginName),
      copyValue: row.pluginName,
      mono: true,
    },
    {
      label: 'Query Source',
      value: display(row.querySource),
      copyValue: row.querySource,
      mono: true,
    },
    { label: 'Effort', value: display(row.effort), mono: true },
    { label: 'Speed', value: display(row.speed), mono: true },
    {
      label: 'Input Tokens',
      value: displayNumber(row.inputTokens),
      mono: true,
    },
    {
      label: 'Output Tokens',
      value: displayNumber(row.outputTokens),
      mono: true,
    },
    {
      label: 'Cache Read Tokens',
      value: displayNumber(row.cacheReadTokens),
      mono: true,
    },
    {
      label: 'Cache Creation Tokens',
      value: displayNumber(row.cacheCreationTokens),
      mono: true,
    },
    {
      label: 'Tool Calls',
      value: row.toolCallCount && row.toolCallCount > 0 ? formatInteger(row.toolCallCount) : '—',
      mono: true,
    },
    { label: 'Started At', value: formatDateTime(row.startedAt), mono: true },
    {
      label: 'Completed At',
      value: formatDateTime(row.completedAt),
      mono: true,
    },
  ];
}

function toTextBlocks(row: SddInteractionItem | SddInteractionDetail): RowInspectorTextBlock[] {
  const promptText = 'promptText' in row ? row.promptText : row.promptPreview;
  const responseText = 'responseText' in row ? row.responseText : row.responsePreview;
  const responseJson = 'responseJson' in row ? row.responseJson : null;

  return [
    {
      title: 'Full Prompt',
      content: promptText,
      copyValue: promptText,
      icon: <ArrowRightCircle size={16} />,
      emptyText: '无 prompt 文本',
    },
    {
      title: 'Full Response',
      content: responseText,
      copyValue: responseText,
      icon: <ArrowLeftCircle size={16} />,
      emptyText: '无 response 文本',
    },
    ...(responseJson
      ? [
          {
            title: 'Response JSON',
            content: responseJson,
            copyValue: responseJson,
            emptyText: '无 response JSON',
          },
        ]
      : []),
  ];
}

function display(value: string | null | undefined): string {
  return value && value.length > 0 ? value : '—';
}

function displayNumber(value: number | null | undefined): string {
  return value == null ? '—' : formatInteger(value);
}

function formatTokenPair(item: SddInteractionItem): string {
  if (item.inputTokens == null && item.outputTokens == null) {
    return '—';
  }

  return `${displayNumber(item.inputTokens)} / ${displayNumber(item.outputTokens)}`;
}

function ToolCallsSection({
  calls,
  loading,
  error,
}: {
  calls: SddInteractionToolCall[];
  loading: boolean;
  error: string | null;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 text-[13px] font-semibold text-[#f5f5f5]">
        <Wrench size={16} className="text-[var(--color-muted)]" />
        <span>工具调用时间线</span>
      </div>
      {loading ? (
        <div className="text-[12px] text-[var(--color-muted)]">正在加载工具调用...</div>
      ) : null}
      {error ? <div className="text-[12px] text-[#f87171]">工具调用加载失败：{error}</div> : null}
      {!loading && !error ? (
        <DataTable
          headers={['#', '工具', '决策', '状态', '耗时', '入参', '结果']}
          rows={calls.map(toToolCallRow)}
          emptyText="暂无工具调用"
        />
      ) : null}
    </section>
  );
}

function toToolCallRow(call: SddInteractionToolCall): DataTableRow {
  return {
    key: call.toolUseId,
    cells: [
      call.sequence,
      call.toolName,
      call.decision ?? '—',
      call.success == null ? '—' : <StatusBadge status={call.success ? 'success' : 'failed'} />,
      call.durationMs == null ? '—' : `${call.durationMs} ms`,
      truncate(call.toolInputPreview, 120),
      call.resultSizeBytes == null ? '—' : `${formatInteger(call.resultSizeBytes)} B`,
    ],
  };
}
