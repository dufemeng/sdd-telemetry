import { useState } from 'react';
import { ArrowLeftCircle, ArrowRightCircle, BookOpen, TerminalSquare, Wrench } from 'lucide-react';
import {
  useSddInteractionDetail,
  useSddInteractionToolCalls,
} from '@/pages/sdd/interactions/useSddInteractions';
import {
  RowInspectorDrawer,
  type RowInspectorField,
  type RowInspectorTextBlock,
} from '@/components/ui/RowInspectorDrawer';
import { DataTable, type DataTableRow } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatDateTime, formatInteger, formatUsd } from '@/lib/format';
import { truncate } from '@/lib/format';
import type { SddInteractionDetail, SddInteractionItem, SddInteractionToolCall } from '@sdd-telemetry/api';
import { WikiDocModal } from './WikiDocModal';

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
  const detailQuery = useSddInteractionDetail(interactionId);
  const toolCallsQuery = useSddInteractionToolCalls(interactionId);

  const inspectorRow = detailQuery.data ?? initialRow ?? null;
  const fallbackRow = interactionId ? { id: interactionId } : null;
  const [wikiDocToolCallId, setWikiDocToolCallId] = useState<string | null>(null);

  return (
    <>
      <RowInspectorDrawer
        open={open}
        onOpenChange={onOpenChange}
        title={inspectorRow?.interactionKey ?? interactionId ?? '交互详情'}
        subtitle={
          inspectorRow?.sessionId
            ? `session ${inspectorRow.sessionId}`
            : interactionId
              ? `row ${interactionId}`
              : undefined
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
          onOpenWikiDoc={setWikiDocToolCallId}
        />
      </RowInspectorDrawer>
      <WikiDocModal
        toolCallId={wikiDocToolCallId}
        open={Boolean(wikiDocToolCallId)}
        onOpenChange={(o) => {
          if (!o) setWikiDocToolCallId(null);
        }}
      />
    </>
  );
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
      label: 'Pairing Method',
      value: formatPairingMethod(row.pairingMethod),
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

function formatPairingMethod(value: SddInteractionItem['pairingMethod']): string {
  switch (value) {
    case 'prompt_id':
      return 'prompt_id';
    case 'anchored_by_user_prompt':
      return 'anchored';
    default:
      return '—';
  }
}

function ToolCallsSection({
  calls,
  loading,
  error,
  onOpenWikiDoc,
}: {
  calls: SddInteractionToolCall[];
  loading: boolean;
  error: string | null;
  onOpenWikiDoc: (toolCallId: string) => void;
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
          headers={['#', '工具', 'wiki', '决策', '状态', '耗时', '入参', '结果']}
          rows={calls.map((call) => toToolCallRow(call, onOpenWikiDoc))}
          emptyText="暂无工具调用"
        />
      ) : null}
    </section>
  );
}

function toToolCallRow(
  call: SddInteractionToolCall,
  onOpenWikiDoc: (toolCallId: string) => void,
): DataTableRow {
  const wikiBadgeClass =
    'inline-flex items-center gap-1 rounded-[4px] px-2 py-[2px] text-[11px] text-[var(--color-primary)]';
  const wikiBadgeStyle = {
    background: 'rgba(250,255,105,0.08)',
    border: '1px solid rgba(250,255,105,0.18)',
  };
  return {
    key: call.toolUseId,
    cells: [
      call.sequence,
      call.toolName,
      call.isWikiRecall ? (
        call.toolName === 'Read' ? (
          <button
            type="button"
            onClick={() => onOpenWikiDoc(call.id)}
            className={`${wikiBadgeClass} cursor-pointer hover:brightness-125`}
            style={wikiBadgeStyle}
            title="查看知识库文档内容"
          >
            <BookOpen size={12} />
            wiki
          </button>
        ) : (
          <span
            className={wikiBadgeClass}
            style={wikiBadgeStyle}
            title={call.skillUsageId ? `skill_usage_id: ${call.skillUsageId}` : '召回 wiki 文件'}
          >
            <BookOpen size={12} />
            wiki
          </span>
        )
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
