import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, GitBranch, Layers, BookOpen, MessageSquare, Zap } from 'lucide-react';
import { useShellContext } from '@/components/layout/useShellContext';
import { useProfilePresentationModel, useProfileUserActivity, useProfileUserDetail } from '@/pages/profiles/useProfiles';
import { UserWorkItemList } from './components/UserWorkItemList';
import { UserActivityTimeline } from './components/UserActivityTimeline';
import { InteractionDetailDrawer } from '@/components/sdd/InteractionDetailDrawer';
import { formatInteger } from '@/lib/format';

const CARD_STYLE = { border: '1px solid var(--color-border)', background: 'var(--color-surface)' };
const DAY_MS = 86_400_000;

const AVATAR_COLORS = ['#1a1a1a', '#2a1a1a', '#2a251a', '#251a1a', '#1a251a', '#251a15'];

function UserAvatar({ name, size = 28 }: { name: string | null | undefined; size?: number }) {
  const idx = (name?.charCodeAt(0) ?? 0) % AVATAR_COLORS.length;
  return (
    <div
      className="flex-none rounded-full flex items-center justify-center font-semibold"
      style={{
        width: size,
        height: size,
        background: AVATAR_COLORS[idx],
        color: '#f5f5f5',
        fontSize: Math.round(size * 0.42),
        border: '1px solid rgba(255,255,255,0.08)',
        flexShrink: 0,
      }}
    >
      {name ? name.slice(0, 1) : '?'}
    </div>
  );
}

function StatusBadge({ status, isNew }: { status: 'live' | 'cold' | 'churn'; isNew: boolean }) {
  const map = {
    live: { cls: 'text-[var(--color-good-text)] bg-[var(--color-good-bg)]', label: '活跃' },
    cold: { cls: 'text-[var(--color-secondary)] bg-[rgba(255,255,255,0.06)]', label: '转冷' },
    churn: { cls: 'text-[var(--color-bad-text)] bg-[var(--color-bad-bg)]', label: '流失' },
  } as const;
  const { cls, label } = map[status];
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-flex items-center h-[20px] px-2 rounded-full text-[11px] font-medium whitespace-nowrap ${cls}`}>
        {label}
      </span>
      {isNew ? (
        <span className="inline-flex items-center h-[20px] px-2 rounded-full text-[11px] font-medium whitespace-nowrap text-[var(--color-primary)] bg-[rgba(250,255,105,0.10)]">
          新成员
        </span>
      ) : null}
    </span>
  );
}

export default function UserProfilePage() {
  const { id: userId = '' } = useParams();
  const { profileId } = useShellContext();
  const presentation = useProfilePresentationModel(profileId);
  const navigate = useNavigate();
  const profileQuery = useProfileUserDetail(profileId, userId || null);
  const profile = profileQuery.data;

  const [selectedWorkItemId, setSelectedWorkItemId] = useState<string | null>(null);
  const [openInteractionId, setOpenInteractionId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedWorkItemId(null);
  }, [userId]);

  const activityQuery = useProfileUserActivity(profileId, userId || null, {
    deliveryUnitId: selectedWorkItemId,
    range: '30d',
    limit: 200,
  });
  const activityNodes = activityQuery.data?.items ?? [];

  if (profileQuery.isLoading) {
    return <div className="p-4 text-[13px] text-[var(--color-muted)]">加载中…</div>;
  }
  if (!profile) {
    return (
      <div className="p-4 text-[13px] text-[var(--color-muted)]">
        用户不存在。
        <Link to="/sdd/users" className="ml-2 text-[var(--color-primary)] hover:underline">返回列表</Link>
      </div>
    );
  }

  const { user, summary, deliveryUnits } = profile;
  const workItems = deliveryUnits;
  const joinDays = user.firstSeenAt
    ? Math.floor((Date.now() - new Date(user.firstSeenAt).getTime()) / DAY_MS)
    : null;

  const selectedTitle = selectedWorkItemId
    ? workItems.find((wi) => wi.deliveryUnitId === selectedWorkItemId)?.title ?? '选中需求'
    : null;

  return (
    <div className="grid gap-3">

      {/* Header */}
      <section className="flex flex-col gap-3 p-[14px] rounded-[6px]" style={CARD_STYLE}>
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate('/sdd/users')}
            className="inline-flex items-center gap-1 text-[12px] text-[var(--color-muted)] hover:text-[var(--color-secondary)]"
          >
            <ArrowLeft size={14} /> 用户分析
          </button>
          <span className="text-[10px] text-[var(--color-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
            ID {user.id}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <UserAvatar name={user.displayName} size={48} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-[4px]">
              <h2 className="text-[18px] font-semibold text-[#f5f5f5]">
                {user.displayName ?? '未知用户'}
              </h2>
              <StatusBadge status={user.status} isNew={user.isNew} />
              {joinDays !== null ? (
                <span className="text-[12px] text-[var(--color-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
                  接入 {joinDays} 天
                </span>
              ) : null}
              <span className="text-[12px] text-[var(--color-secondary)]" style={{ fontFamily: 'var(--font-mono)' }}>
                {user.capabilityUsageCount} 次 skill
              </span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[var(--color-secondary)]" style={{ fontFamily: 'var(--font-mono)' }}>
              <span><GitBranch size={11} className="inline mr-[3px]" />需求 {summary.deliveryUnitCount}</span>
              <span><Layers size={11} className="inline mr-[3px]" />文档 {summary.artifactCount}</span>
              <span><MessageSquare size={11} className="inline mr-[3px]" />{formatInteger(summary.turnCount)} 轮对话</span>
              <span>跨 {formatInteger(summary.sessionCount)} session</span>
              <span><BookOpen size={11} className="inline mr-[3px]" />知识库 {summary.knowledgeRecallCount} 次</span>
              <span><Zap size={11} className="inline mr-[3px]" />{summary.codeWriteCount} 次编码</span>
            </div>
          </div>
        </div>
      </section>

      {/* Two-column body */}
      <div className="grid gap-3" style={{ gridTemplateColumns: '300px 1fr' }}>
        <section className="rounded-[6px] overflow-hidden" style={CARD_STYLE}>
          <UserWorkItemList
            workItems={workItems}
            selectedId={selectedWorkItemId}
            onSelect={setSelectedWorkItemId}
            stages={presentation.stages.artifactStages}
          />
        </section>

        <section className="rounded-[6px] overflow-hidden" style={CARD_STYLE}>
          <div className="px-3 py-[8px] flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)' }}>
            <span className="text-[12px] font-semibold text-[#f5f5f5]">
              {selectedTitle ? `互动记录 · ${selectedTitle}` : '互动记录'}
            </span>
          </div>
          <UserActivityTimeline
            nodes={activityNodes}
            onOpenInteraction={setOpenInteractionId}
          />
        </section>
      </div>

      <InteractionDetailDrawer
        interactionId={openInteractionId}
        open={Boolean(openInteractionId)}
        onOpenChange={(open) => { if (!open) setOpenInteractionId(null); }}
      />
    </div>
  );
}
