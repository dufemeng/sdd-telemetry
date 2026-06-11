import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { requestData } from '@/api/client';
import type { DailyReportDetailResponse } from '@sdd-telemetry/api';
import { useAuth } from '@/components/auth/useAuth';
import { useShellContext } from '@/components/layout/useShellContext';
import { useProfilePresentation } from '@/pages/profiles/useProfiles';
import { useLatestDailyReport, useDailyReport } from './useDailyReport';
import { useDailyReportList } from './useDailyReportList';
import { DailyReportDocument } from './DailyReportDocument';
import { DailyReportToolbar } from './DailyReportToolbar';
import { DailyReportHistory } from './DailyReportHistory';
import './daily-report.css';

export default function DailyReportsPage() {
  const { date: routeDate } = useParams<{ date?: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profileId } = useShellContext();
  const profilePresentation = useProfilePresentation(profileId);
  const isProfileLoaded = Boolean(profilePresentation);
  const isSddProfile = profilePresentation?.workflowKind === 'sdd';
  const shouldLoadReport = isProfileLoaded && isSddProfile;
  const [showHistory, setShowHistory] = useState(false);
  const docRef = useRef<HTMLDivElement>(null);

  const isLatest = !routeDate || routeDate === 'latest';
  const latestQuery = useLatestDailyReport(shouldLoadReport);
  const dateQuery = useDailyReport(isLatest ? undefined : routeDate, shouldLoadReport);

  const report = isLatest ? latestQuery.data : dateQuery.data;
  const loading = isLatest ? latestQuery.isLoading : dateQuery.isLoading;

  const listQuery = useDailyReportList(undefined, undefined, 1, 60, shouldLoadReport);

  const regenMutation = useMutation({
    mutationFn: (targetDate: string) =>
      requestData<DailyReportDetailResponse | null>(
        `/api/reports/daily/${targetDate}/regenerate`,
        { method: 'POST' },
      ),
    onSuccess: () => {
      if (isLatest) latestQuery.refetch();
      else dateQuery.refetch();
    },
  });

  const handleRegenerate = useCallback(() => {
    if (report?.reportDate) {
      regenMutation.mutate(report.reportDate);
    }
  }, [report?.reportDate, regenMutation]);

  const handleGenerateYesterday = useCallback(() => {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    regenMutation.mutate(dateStr, {
      onSuccess: () => navigate(`/reports/daily/${dateStr}`, { replace: true }),
    });
  }, [regenMutation, navigate]);

  useEffect(() => {
    if (shouldLoadReport && isLatest && latestQuery.data?.reportDate) {
      navigate(`/reports/daily/${latestQuery.data.reportDate}`, { replace: true });
    }
  }, [isLatest, latestQuery.data?.reportDate, navigate, shouldLoadReport]);

  if (!isProfileLoaded) {
    return (
      <div className="daily-report-stage" style={{ position: 'relative' }}>
        <div className="dr-empty-state">
          <p>加载中...</p>
        </div>
      </div>
    );
  }

  if (!isSddProfile) {
    return (
      <div className="daily-report-stage" style={{ position: 'relative' }}>
        <div className="dr-empty-state">
          <h2>SDD 每日简报</h2>
          <p>当前 profile 使用 source-backed 工作流；日报仍是 SDD 专属报表，不参与当前 profile 的展示。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="daily-report-stage" style={{ position: 'relative' }}>
      <div className="daily-report-site-strip">
        <div className="daily-report-crumb">
          <span className="daily-report-pulse" />
          <span>SDD 质量观测台 / 每日简报 / {report?.reportDate ?? '...'}</span>
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            style={{
              marginLeft: 8,
              padding: '2px 8px',
              fontSize: 11,
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 3,
              background: '#171717',
              color: '#93927c',
              cursor: 'pointer',
            }}
          >
            历史
          </button>
        </div>
        {report && (
          <DailyReportToolbar
            reportDate={report.reportDate}
            docRef={docRef}
            onRegenerate={handleRegenerate}
            regenerating={regenMutation.isPending}
          />
        )}
      </div>

      {showHistory && listQuery.data && (
        <DailyReportHistory items={listQuery.data.items} currentDate={report?.reportDate} />
      )}

      {loading && (
        <div className="dr-empty-state">
          <p>加载中...</p>
        </div>
      )}

      {!loading && !report && (
        <div className="dr-empty-state">
          <h2>暂无日报</h2>
          <p>还没有生成过每日简报。系统会在每天 12:00 自动生成昨天日报。</p>
          {user.role === 'super_admin' && (
            <button
              type="button"
              onClick={handleGenerateYesterday}
              disabled={regenMutation.isPending}
              style={{
                marginTop: 16,
                padding: '8px 20px',
                fontSize: 13,
                border: '1px solid rgba(250, 255, 105, 0.34)',
                borderRadius: 4,
                background: '#202016',
                color: 'var(--color-primary, #faff69)',
                cursor: regenMutation.isPending ? 'not-allowed' : 'pointer',
                opacity: regenMutation.isPending ? 0.6 : 1,
              }}
            >
              {regenMutation.isPending ? '生成中...' : '立即生成昨天日报'}
            </button>
          )}
        </div>
      )}

      {!loading && report?.status === 'failed' && (
        <div className="dr-empty-state">
          <h2>生成失败</h2>
          <p>{report.errorMessage ?? '日报生成过程中出现错误。'}</p>
        </div>
      )}

      {!loading && report?.status === 'generated' && report.metrics && (
        <DailyReportDocument metrics={report.metrics} docRef={docRef} />
      )}
    </div>
  );
}
