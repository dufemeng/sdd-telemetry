import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { requestData } from '@/api/client';
import type { DailyReportDetailResponse } from '@sdd-telemetry/api';
import { useLatestDailyReport, useDailyReport } from './useDailyReport';
import { useDailyReportList } from './useDailyReportList';
import { DailyReportDocument } from './DailyReportDocument';
import { DailyReportToolbar } from './DailyReportToolbar';
import { DailyReportHistory } from './DailyReportHistory';
import './daily-report.css';

export default function DailyReportsPage() {
  const { date: routeDate } = useParams<{ date?: string }>();
  const navigate = useNavigate();
  const [showHistory, setShowHistory] = useState(false);

  const isLatest = !routeDate || routeDate === 'latest';
  const latestQuery = useLatestDailyReport();
  const dateQuery = useDailyReport(isLatest ? undefined : routeDate);

  const report = isLatest ? latestQuery.data : dateQuery.data;
  const loading = isLatest ? latestQuery.isLoading : dateQuery.isLoading;

  const listQuery = useDailyReportList(undefined, undefined, 1, 60);

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

  useEffect(() => {
    if (isLatest && latestQuery.data?.reportDate) {
      navigate(`/reports/daily/${latestQuery.data.reportDate}`, { replace: true });
    }
  }, [isLatest, latestQuery.data?.reportDate, navigate]);

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
            markdownText={report.markdownText}
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
        </div>
      )}

      {!loading && report?.status === 'failed' && (
        <div className="dr-empty-state">
          <h2>生成失败</h2>
          <p>{report.errorMessage ?? '日报生成过程中出现错误。'}</p>
        </div>
      )}

      {!loading && report?.status === 'generated' && report.metrics && (
        <DailyReportDocument metrics={report.metrics} />
      )}
    </div>
  );
}
