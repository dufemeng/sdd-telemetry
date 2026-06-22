import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useProfileUserActivity, useProfileUserDetail } from '@/pages/profiles/useProfiles';
import { UserActivityTimeline } from './components/UserActivityTimeline';
import { InteractionDetailDrawer } from '@/components/sdd/InteractionDetailDrawer';
import { Pagination } from '@/components/ui/Pagination';
import { useShellContext } from '@/components/layout/useShellContext';
import { formatInteger } from '@/lib/format';

const CARD_STYLE = { border: '1px solid var(--color-border)', background: 'var(--color-surface)' };
const PAGE_SIZE = 20;

export default function UserActivityPage() {
  const { id: userId = '' } = useParams();
  const { profileId } = useShellContext();
  const detailQuery = useProfileUserDetail(profileId, userId || null);
  const activityQuery = useProfileUserActivity(profileId, userId || null, {
    range: 'all',
    limit: 200,
  });
  const [openInteractionId, setOpenInteractionId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const allNodes = activityQuery.data?.items ?? [];
  const totalInteractions = activityQuery.data?.totalInteractions ?? 0;
  const truncated = activityQuery.data?.truncated ?? false;
  const displayName = detailQuery.data?.user.displayName ?? null;

  const totalPages = Math.max(Math.ceil(allNodes.length / PAGE_SIZE), 1);
  const safePage = Math.min(page, totalPages);
  const pageNodes = allNodes.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // 用户不存在（detail 查询完成且无数据）
  if (!detailQuery.isLoading && detailQuery.data === undefined && detailQuery.isError) {
    return (
      <div className="p-4 text-[13px] text-[var(--color-muted)]">
        用户不存在。
        <Link to="/sdd/users" className="ml-2 text-[var(--color-primary)] hover:underline">
          返回列表
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <section className="flex flex-col gap-2 p-[14px] rounded-[6px]" style={CARD_STYLE}>
        <Link
          to={`/sdd/users/${userId}`}
          className="self-start inline-flex items-center gap-1 text-[12px] text-[var(--color-muted)] hover:text-[var(--color-secondary)]"
        >
          <ArrowLeft size={14} /> {displayName ?? '用户'}
        </Link>
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-semibold text-[#f5f5f5]">完整互动记录</h2>
          <span className="text-[11px] text-[var(--color-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
            共 {formatInteger(totalInteractions)} 条
            {truncated ? <span className="text-[var(--color-warn-text)]"> · 仅加载最近 {allNodes.length} 条</span> : null}
          </span>
        </div>
        {truncated ? (
          <div className="text-[11px] text-[var(--color-warn-text)]">
            活动较多，当前仅展示最近 {allNodes.length} 条；更早的记录未加载。
          </div>
        ) : null}
      </section>

      {activityQuery.isLoading ? (
        <section className="rounded-[6px] overflow-hidden p-4 text-[13px] text-[var(--color-muted)]" style={CARD_STYLE}>
          加载中…
        </section>
      ) : activityQuery.isError ? (
        <section className="rounded-[6px] overflow-hidden p-4 text-[13px] text-[var(--color-bad-text)]" style={CARD_STYLE}>
          互动记录加载失败，请稍后重试。
        </section>
      ) : pageNodes.length === 0 ? (
        <section className="rounded-[6px] overflow-hidden p-4 text-[13px] text-[var(--color-muted)]" style={CARD_STYLE}>
          暂无互动记录
        </section>
      ) : (
        <section className="rounded-[6px] overflow-hidden" style={CARD_STYLE}>
          <UserActivityTimeline nodes={pageNodes} onOpenInteraction={setOpenInteractionId} />
        </section>
      )}

      <Pagination
        pageNumber={safePage}
        pageSize={PAGE_SIZE}
        hasPrev={safePage > 1}
        hasNext={safePage < totalPages}
        onPrev={() => setPage((p) => Math.max(1, p - 1))}
        onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
      />

      <InteractionDetailDrawer
        interactionId={openInteractionId}
        open={Boolean(openInteractionId)}
        onOpenChange={(open) => {
          if (!open) setOpenInteractionId(null);
        }}
      />
    </div>
  );
}
