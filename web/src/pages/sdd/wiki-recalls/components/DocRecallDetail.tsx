import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpen, Clock3, FileText, Users } from 'lucide-react';
import type { ProfileKnowledgePathDimensionDoc } from '@sdd-telemetry/api';
import { WikiDocModal } from '@/components/sdd/WikiDocModal';
import { useWikiRecallDocDetail } from '../useWikiRecalls';
import { CARD_STYLE } from '../styles';
import { formatInteger, formatRelativeTime } from '@/lib/format';

export function DocRecallDetail({
  sourceNamespace,
  doc,
}: {
  sourceNamespace: string;
  doc: ProfileKnowledgePathDimensionDoc | null;
}) {
  const navigate = useNavigate();
  const [modalOpen, setModalOpen] = useState(false);
  const detailQuery = useWikiRecallDocDetail(
    doc ? sourceNamespace : null,
    doc ? doc.relativePath : null,
  );

  if (!doc) {
    return (
      <div className="grid place-items-center rounded-[6px] p-8" style={CARD_STYLE}>
        <span className="text-[12px] text-[var(--color-muted)]">选择左侧文档查看详情</span>
      </div>
    );
  }

  const detail = detailQuery.data;
  const hasAccess =
    doc.accessCount > 0 ||
    (detail && (detail.readers.length > 0 || detail.sourceDeliveryUnits.length > 0));
  const isEmpty = !detailQuery.isLoading && !hasAccess;

  return (
    <div className="grid gap-3 rounded-[6px] p-[14px]" style={CARD_STYLE}>
      <div
        className="flex items-start justify-between gap-3 pb-2"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <div className="min-w-0">
          <div
            className="truncate text-[13px] font-semibold text-[#f5f5f5]"
            style={{ fontFamily: 'var(--font-mono)' }}
            title={doc.relativePath}
          >
            {doc.relativePath}
          </div>
          <div className="mt-1 text-[11px] text-[var(--color-muted)]">
            {formatInteger(doc.accessCount)} 次访问 · {formatInteger(doc.distinctUsers)} 位读者
            {doc.lastAccessAt ? ` · 最近 ${formatRelativeTime(doc.lastAccessAt)}` : ''}
          </div>
        </div>
        <button
          className="flex flex-none items-center gap-1 rounded-[4px] px-2 py-1 text-[11px] text-[var(--color-secondary)] hover:bg-[#222] hover:text-[#f5f5f5]"
          style={{ border: '1px solid var(--color-border)' }}
          onClick={() => setModalOpen(true)}
        >
          <BookOpen size={12} />
          查看正文
        </button>
      </div>

      {detailQuery.isLoading ? (
        <div className="text-[12px] text-[var(--color-muted)]">加载中…</div>
      ) : isEmpty ? (
        <div className="py-4 text-center text-[12px] text-[var(--color-muted)]">该文档暂无召回</div>
      ) : detail ? (
        <>
          <DocTrendSection trend={detail.trend} total={doc.accessCount} />
          <ReadersSection
            readers={detail.readers}
            onNavigate={(uid) => navigate(`/sdd/users/${uid}`)}
          />
          <SourceWorkItemsSection
            items={detail.sourceDeliveryUnits.map((item) => ({
              workItemId: item.deliveryUnitId,
              workItemSlug: item.unitSlug ?? '',
              businessDomain: item.businessDomain,
              accessCount: item.accessCount,
            }))}
            onNavigate={(wid) => navigate(`/sdd/work-items/${wid}`)}
          />
        </>
      ) : null}

      <WikiDocModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        toolCallId={null}
        source={{ repo: sourceNamespace, relativePath: doc.relativePath }}
      />
    </div>
  );
}

function DocTrendSection({
  trend,
  total,
}: {
  trend: Array<{ t: string; accessCount: number }>;
  total: number;
}) {
  const sparkline = useMemo(() => {
    const values = trend.map((p) => p.accessCount);
    const max = Math.max(...values, 1);
    return { values, max };
  }, [trend]);

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-[#f5f5f5]">
        <Clock3 size={13} style={{ color: 'var(--color-primary)' }} />
        趋势(近30天)
        <span
          className="text-[11px] font-normal text-[var(--color-muted)]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {formatInteger(total)} 次
        </span>
      </div>
      {sparkline.values.length === 0 ? (
        <div className="text-[11px] text-[var(--color-muted)]">暂无趋势数据</div>
      ) : (
        <div className="flex items-end gap-[2px]" style={{ height: 40 }}>
          {sparkline.values.map((v, i) => (
            <div
              key={i}
              className="flex-1 min-w-[3px] rounded-t-[2px]"
              style={{
                height: `${Math.max((v / sparkline.max) * 100, 6)}%`,
                background: v > 0 ? 'var(--color-primary)' : 'rgba(255,255,255,0.06)',
                opacity: v > 0 ? 0.8 : 0.3,
              }}
              title={`${v} 次`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ReadersSection({
  readers,
  onNavigate,
}: {
  readers: Array<{
    userId: string;
    userName: string | null;
    accessCount: number;
    lastAccessAt: string | null;
  }>;
  onNavigate: (userId: string) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-[#f5f5f5]">
        <Users size={13} style={{ color: 'var(--color-primary)' }} />
        读者
        <span className="text-[11px] font-normal text-[var(--color-muted)]">
          · {readers.length} 人
        </span>
      </div>
      {readers.length === 0 ? (
        <div className="text-[11px] text-[var(--color-muted)]">暂无读者数据</div>
      ) : (
        <div className="grid gap-[2px]">
          {readers.map((r) => (
            <button
              key={r.userId}
              className="group flex items-center justify-between gap-2 rounded-[4px] px-2 py-[5px] text-left hover:bg-[#171717]"
              onClick={() => onNavigate(r.userId)}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-[12px] text-[var(--color-secondary)]">
                  {r.userName ?? r.userId}
                </span>
                {r.lastAccessAt && (
                  <span className="flex-none text-[10px] text-[var(--color-muted)]">
                    {formatRelativeTime(r.lastAccessAt)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <span
                  className="text-[11px] text-[var(--color-muted)]"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {r.accessCount} 次
                </span>
                <ArrowRight
                  size={12}
                  className="text-[var(--color-muted)] opacity-0 transition-opacity group-hover:opacity-100"
                />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SourceWorkItemsSection({
  items,
  onNavigate,
}: {
  items: Array<{
    workItemId: string;
    workItemSlug: string;
    businessDomain: string | null;
    accessCount: number;
  }>;
  onNavigate: (workItemId: string) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-[#f5f5f5]">
        <FileText size={13} style={{ color: 'var(--color-primary)' }} />
        来源需求
        <span className="text-[11px] font-normal text-[var(--color-muted)]">
          · {items.length} 个
        </span>
      </div>
      {items.length === 0 ? (
        <div className="text-[11px] text-[var(--color-muted)]">暂无来源需求</div>
      ) : (
        <div className="grid gap-[2px]">
          {items.map((w) => (
            <button
              key={w.workItemId}
              className="group flex items-center justify-between gap-2 rounded-[4px] px-2 py-[5px] text-left hover:bg-[#171717]"
              onClick={() => onNavigate(w.workItemId)}
            >
              <div className="flex min-w-0 flex-col">
                <span
                  className="truncate text-[12px] text-[var(--color-secondary)]"
                  style={{ fontFamily: 'var(--font-mono)' }}
                  title={w.workItemSlug}
                >
                  {w.workItemSlug}
                </span>
                {w.businessDomain && (
                  <span className="truncate text-[10px] text-[var(--color-muted)]">
                    {w.businessDomain}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <span
                  className="text-[11px] text-[var(--color-muted)]"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {w.accessCount} 次
                </span>
                <ArrowRight
                  size={12}
                  className="text-[var(--color-muted)] opacity-0 transition-opacity group-hover:opacity-100"
                />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
