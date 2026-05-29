import { useMemo, useState } from 'react';
import { Search, Workflow } from 'lucide-react';
import { useShellContext } from '@/components/layout/useShellContext';
import { useSddInteractions } from './useSddInteractions';
import { Panel } from '@/components/ui/Panel';
import { DataTable, type DataTableRow } from '@/components/ui/DataTable';
import { Pagination } from '@/components/ui/Pagination';
import { StatusBadge } from '@/components/ui/StatusBadge';
import {
  formatTime,
  formatInteger,
  formatUsd,
  truncate,
} from '@/lib/format';
import { useClientPagination } from '@/lib/useClientPagination';
import { InteractionDetailDrawer } from '@/components/sdd/InteractionDetailDrawer';
import type { SddInteractionItem } from '@sdd-telemetry/api';

const PAGE_SIZE = 20;

export default function InteractionsPage() {
  const { timeRange } = useShellContext();
  const { data } = useSddInteractions(timeRange);
  const [search, setSearch] = useState('');
  const [selectedInteractionId, setSelectedInteractionId] = useState<string | null>(null);

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

  return (
    <>
      <Panel title="交互明细" icon={<Workflow size={18} />}>
        <div className="grid gap-3">
          <div
            className="flex items-center gap-2 h-[28px] px-[10px] w-[260px] rounded-[4px]"
            style={{ border: '1px solid rgba(255,255,255,0.10)', background: 'var(--color-base)' }}
          >
            <Search size={13} className="text-[var(--color-muted)] shrink-0" />
            <input
              className="w-full bg-transparent outline-none text-[12px] text-[var(--color-text)] placeholder:text-[var(--color-muted)]"
              placeholder="搜索会话 / 提示词 / 用户 / 技能"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <DataTable
            headers={[
              '时间',
              '用户',
              'sessionId',
              'promptId',
              '配对方式',
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

      <InteractionDetailDrawer
        interactionId={selectedInteractionId}
        open={Boolean(selectedInteractionId)}
        onOpenChange={(open) => {
          if (!open) setSelectedInteractionId(null);
        }}
        initialRow={selectedInteraction}
      />
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
      formatPairingMethod(item.pairingMethod),
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

function displayNumber(value: number | null | undefined): string {
  return value == null ? '—' : formatInteger(value);
}

function formatTokenPair(item: SddInteractionItem): string {
  if (item.inputTokens == null && item.outputTokens == null) {
    return '—';
  }

  return `${displayNumber(item.inputTokens)} / ${displayNumber(item.outputTokens)}`;
}
