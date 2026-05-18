import { useState } from 'react';
import { ArrowLeftCircle, ArrowRightCircle, TerminalSquare, Workflow } from 'lucide-react';
import { useShellContext } from '../../../components/layout/useShellContext';
import { useSddInteractionDetail, useSddInteractions } from './useSddInteractions';
import { Panel } from '../../../components/ui/Panel';
import { DataTable, type DataTableRow } from '../../../components/ui/DataTable';
import {
  RowInspectorDrawer,
  type RowInspectorField,
  type RowInspectorTextBlock,
} from '../../../components/ui/RowInspectorDrawer';
import { Pagination } from '../../../components/ui/Pagination';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { formatTime, formatDateTime, truncate } from '../../../lib/format';
import { useClientPagination } from '../../../lib/useClientPagination';
import type { SddInteractionDetail, SddInteractionItem } from '@sdd-telemetry/api';

const PAGE_SIZE = 20;

export default function InteractionsPage() {
  const { timeRange, search } = useShellContext();
  const { data } = useSddInteractions(timeRange);
  const [selectedInteractionId, setSelectedInteractionId] = useState<string | null>(null);
  const detailQuery = useSddInteractionDetail(selectedInteractionId);

  const filtered = (data ?? []).filter((item) => {
    if (!search) return true;
    const haystack = [item.sessionId, item.promptId, item.userId, item.commandName]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(search.toLowerCase());
  });

  const { pageItems, pageNumber, hasNext, hasPrev, goNext, goPrev } = useClientPagination(filtered, PAGE_SIZE);
  const selectedInteraction = (data ?? []).find((item) => item.id === selectedInteractionId) ?? null;
  const inspectorRow = detailQuery.data ?? selectedInteraction;
  const fallbackRow = selectedInteractionId ? { id: selectedInteractionId } : null;

  return (
    <>
      <Panel title="交互明细" icon={<Workflow size={18} />}>
        <div className="grid gap-3">
          <DataTable
            headers={['时间', '用户', 'sessionId', 'promptId', '模型', '状态', '耗时', '提示词预览', '回答预览']}
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
          subtitle={inspectorRow?.sessionId ? `session ${inspectorRow.sessionId}` : `row ${selectedInteractionId}`}
          icon={<TerminalSquare size={18} />}
          badge={inspectorRow ? <StatusBadge status={inspectorRow.status} /> : null}
          row={inspectorRow ?? fallbackRow}
          overview={inspectorRow ? toOverviewFields(inspectorRow) : []}
          fields={inspectorRow ? toDetailFields(inspectorRow) : []}
          textBlocks={inspectorRow ? toTextBlocks(inspectorRow) : []}
          rawData={inspectorRow ?? fallbackRow}
          loading={detailQuery.isLoading}
          error={detailQuery.error instanceof Error ? detailQuery.error.message : null}
        />
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
    { label: 'Duration', value: row.durationMs == null ? '—' : `${row.durationMs} ms` },
    { label: 'Completed', value: formatDateTime(row.completedAt ?? row.startedAt) },
  ];
}

function toDetailFields(row: SddInteractionItem | SddInteractionDetail): RowInspectorField[] {
  return [
    { label: 'ID', value: row.id, copyValue: row.id, mono: true },
    { label: 'Interaction Key', value: row.interactionKey, copyValue: row.interactionKey, mono: true },
    { label: 'User ID', value: display(row.userId), copyValue: row.userId, mono: true },
    { label: 'Session ID', value: display(row.sessionId), copyValue: row.sessionId, mono: true },
    { label: 'Prompt ID', value: display(row.promptId), copyValue: row.promptId, mono: true },
    { label: 'Command', value: display(row.commandName), copyValue: row.commandName, mono: true },
    { label: 'Started At', value: formatDateTime(row.startedAt), mono: true },
    { label: 'Completed At', value: formatDateTime(row.completedAt), mono: true },
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
      ? [{
          title: 'Response JSON',
          content: responseJson,
          copyValue: responseJson,
          emptyText: '无 response JSON',
        }]
      : []),
  ];
}

function display(value: string | null | undefined): string {
  return value && value.length > 0 ? value : '—';
}
