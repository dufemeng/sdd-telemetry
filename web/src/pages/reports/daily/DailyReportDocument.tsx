import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { DailyReportMetrics } from '@sdd-telemetry/api';
import './daily-report.css';

interface Props {
  metrics: DailyReportMetrics;
  docRef?: RefObject<HTMLDivElement | null>;
}

const STAGE_ORDER = ['proposal', 'design', 'task', 'review'] as const;
const EMPTY_CODE_IMPACT: DailyReportMetrics['codeImpact'] = {
  codeWriteCount: 0,
  codeReadCount: 0,
  touchedFileCount: 0,
  contributorCount: 0,
  topRepositories: [],
  summary: '昨日未观测到 SDD 参与业务代码读写。',
};

function kpiProgress(v: number): number {
  if (v <= 0) return 0.05;
  if (v >= 100) return 0.95;
  return Math.max(0.1, Math.min(0.95, v / 100));
}

function deltaText(d: { delta: number; deltaRate: number | null }): string {
  if (d.delta === 0) return '与前日持平';
  const sign = d.delta > 0 ? '+' : '';
  if (d.deltaRate !== null && Math.abs(d.deltaRate) > 0.01) {
    return `较前日 ${sign}${(d.deltaRate * 100).toFixed(1)}%`;
  }
  return `较前日 ${sign}${d.delta}`;
}

function deltaClass(d: { delta: number }): string {
  return d.delta > 0 ? 'positive' : d.delta < 0 ? 'negative' : '';
}

function stageTagStatus(status: string) {
  if (status === 'healthy') return 'dr-good';
  if (status === 'growing') return 'dr-good';
  if (status === 'watch') return 'dr-warn';
  return 'dr-info';
}

function stageTagLabel(status: string) {
  if (status === 'healthy') return '健康';
  if (status === 'growing') return '增长';
  if (status === 'watch') return '偏弱';
  return '推进';
}

function benchmarkTag(stageCodes: string[], wikiCount: number) {
  if (stageCodes.length >= 3) return { cls: 'dr-good', text: '全链路' };
  if (wikiCount > 5) return { cls: 'dr-info', text: '知识召回' };
  return { cls: 'dr-warn', text: '推进中' };
}

function useCountUp(target: number, duration = 800, delay = 280): number {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number>(0);
  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) { setValue(target); return; }
    const start = performance.now() + delay;
    function tick(now: number) {
      const elapsed = now - start;
      if (elapsed < 0) { rafRef.current = requestAnimationFrame(tick); return; }
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration, delay]);
  return value;
}

export function DailyReportDocument({ metrics, docRef: externalRef }: Props) {
  const internalRef = useRef<HTMLDivElement>(null);

  const setRef = useCallback((el: HTMLDivElement | null) => {
    internalRef.current = el;
    if (externalRef) {
      (externalRef as { current: HTMLDivElement | null }).current = el;
    }
  }, [externalRef]);

  useEffect(() => {
    const el = internalRef.current;
    if (!el) return;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;
    requestAnimationFrame(() => {
      el.classList.add('motion-enter');
    });
  }, []);

  const m = metrics;
  const codeImpact = (m as DailyReportMetrics & { codeImpact?: DailyReportMetrics['codeImpact'] }).codeImpact ?? EMPTY_CODE_IMPACT;

  return (
    <article className="daily-report-document" ref={setRef}>
      <header className="dr-masthead">
        <div>
          <div className="dr-meta">SDD Daily Brief &middot; {m.reportDate}</div>
          <h1>SDD 团队工程效能简报</h1>
          <div className="dr-meta">
            MySQL 派生层 vs Dashboard Links &middot; Generated {formatGenerated(m.generatedAt)}
          </div>
        </div>
        <div className="dr-badge-outline">Internal</div>
      </header>

      <p className="dr-intro">{m.headline}</p>

      <section className="dr-overview">
        <h2>总览 &middot; Overview</h2>
        <div className="dr-kpi-grid">
          <KpiCard index={0} label="活跃用户" value={m.kpis.activeUsers.current} sub={deltaText(m.kpis.activeUsers)} subCls={deltaClass(m.kpis.activeUsers)} progress={kpiProgress(m.kpis.activeUsers.current)} />
          <KpiCard index={1} label="Skill 调用" value={m.kpis.skillUsages.current} sub={deltaText(m.kpis.skillUsages)} subCls={deltaClass(m.kpis.skillUsages)} progress={kpiProgress(m.kpis.skillUsages.current)} />
          <KpiCard index={2} label="覆盖需求" value={m.kpis.coveredWorkItems.current} sub={deltaText(m.kpis.coveredWorkItems)} subCls={deltaClass(m.kpis.coveredWorkItems)} progress={kpiProgress(m.kpis.coveredWorkItems.current)} />
          <KpiCard index={3} label="文档产出" value={m.kpis.documentOutputs.current} sub={deltaText(m.kpis.documentOutputs)} subCls={deltaClass(m.kpis.documentOutputs)} progress={kpiProgress(m.kpis.documentOutputs.current)} />
        </div>
      </section>

      <div className="dr-rule" />

      <section className="dr-section">
        <div className="dr-section-title"><span className="dr-num">1.</span><span className="dr-text">采用规模</span></div>
        <div className="dr-compare">
          <PanelA title="昨日规模">
            <ul>
              <li><strong>{m.adoption.activeUsers} 位活跃用户</strong> 触发过 SDD skill</li>
              <li><strong>{m.adoption.skillUsages} 次 skill 调用</strong>，覆盖 proposal / design / task / review</li>
              <li><strong>{m.adoption.coveredWorkItems} 个需求</strong> 在昨日出现 SDD 活动</li>
            </ul>
          </PanelA>
          <PanelB title="较前日变化">
            <ul>
              <li>活跃用户 <strong>{formatDeltaValue(m.kpis.activeUsers.delta)}</strong></li>
              <li>Skill 调用 <strong>{formatDeltaPercent(m.kpis.skillUsages)}</strong></li>
              <li>覆盖需求 <strong>{formatDeltaValue(m.kpis.coveredWorkItems.delta)}</strong>{m.kpis.coveredWorkItems.current === 0 ? '，已有调用但尚未关联需求；需检查 requirements root 配置' : '，说明推广不是停留在存量需求'}</li>
            </ul>
          </PanelB>
        </div>
        <JudgeBlock title="判定：采用升温" text={m.adoption.summary} />
      </section>

      <section className="dr-section">
        <div className="dr-section-title"><span className="dr-num">2.</span><span className="dr-text">代码落地</span></div>
        <div className="dr-compare">
          <PanelA title="编码参与">
            <ul>
              <li><strong>{codeImpact.codeWriteCount} 次代码改动</strong> 来自 SDD 相关会话</li>
              <li><strong>{codeImpact.codeReadCount} 次代码读取</strong> 支撑定位、理解与修改</li>
              <li>涉及 <strong>{codeImpact.touchedFileCount} 个代码文件</strong>、<strong>{codeImpact.contributorCount} 位用户</strong></li>
            </ul>
          </PanelA>
          <PanelB title="Top 代码仓库">
            <ul>
              {codeImpact.topRepositories.map((repo) => (
                <li key={repo.repository}>
                  <strong>{repo.repository}</strong> 改动 {repo.writeCount} 次，读取 {repo.readCount} 次
                </li>
              ))}
              {codeImpact.topRepositories.length === 0 && (
                <li>昨日无业务代码仓库读写</li>
              )}
            </ul>
          </PanelB>
        </div>
        <JudgeBlock title="判定：SDD 进入编码环节" text={codeImpact.summary} />
      </section>

      <section className="dr-section">
        <div className="dr-section-title"><span className="dr-num">3.</span><span className="dr-text">SDD 链路</span></div>
        <div className="dr-compare">
          <PanelA title="阶段覆盖">
            <ul>
              {m.chain.stages.map((s) => (
                <li key={s.code}>{s.label}覆盖 <strong>{s.workItemCount}</strong> 个需求</li>
              ))}
            </ul>
          </PanelA>
          <PanelB title="全链路状态">
            <ul>
              <li><strong>{m.chain.fullChainWorkItemCount} 个需求</strong> 覆盖 3 个及以上 SDD 阶段</li>
              <li>多阶段需求共 <strong>{m.chain.multiStageWorkItemCount} 个</strong>，均覆盖 2+ 阶段</li>
              {m.chain.stages.filter(s => s.workItemCount > 0).length < m.chain.stages.length && (
                <li>{m.chain.stages.filter(s => s.workItemCount === 0).map(s => s.label).join('、')} 暂无覆盖</li>
              )}
            </ul>
          </PanelB>
        </div>
        <div className="dr-table-wrap">
          <table>
            <thead>
              <tr>
                <th>阶段</th>
                <th className="dr-num-cell">需求数</th>
                <th className="dr-num-cell">较前日</th>
                <th>说明</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {m.chain.stages.map((s) => (
                <tr key={s.code}>
                  <td>{s.label}</td>
                  <td className="dr-num-cell">{s.workItemCount}</td>
                  <td className="dr-num-cell">{s.previousDelta > 0 ? `+${s.previousDelta}` : String(s.previousDelta)}</td>
                  <td>{s.code} artifact 覆盖</td>
                  <td><span className={`dr-tag ${stageTagStatus(s.status)}`}>{stageTagLabel(s.status)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <JudgeBlock title="判定：链路开始加深" text={m.chain.summary} />
      </section>

      {m.benchmarks.length > 0 && (
        <section className="dr-section">
          <div className="dr-section-title"><span className="dr-num">4.</span><span className="dr-text">今日标杆</span></div>
          <div className="dr-compare">
            <PanelA title="完整链路样本">
              <ul>
                {m.benchmarks.slice(0, 2).map((b) => (
                  <li key={b.workItemId}><strong>{b.title}</strong> 覆盖 {b.stageCodes.length} 阶段</li>
                ))}
              </ul>
            </PanelA>
            <PanelB title="知识召回样本">
              <ul>
                {m.benchmarks.filter(b => b.wikiRecallCount > 0).slice(0, 2).map((b) => (
                  <li key={b.workItemId}><strong>{b.title}</strong> 召回 Wiki <strong>{b.wikiRecallCount}</strong> 次</li>
                ))}
                {m.benchmarks.filter(b => b.wikiRecallCount > 0).length === 0 && (
                  <li>昨日无知识召回标杆</li>
                )}
              </ul>
            </PanelB>
          </div>
          <div className="dr-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>需求</th>
                  <th>业务域</th>
                  <th>阶段</th>
                  <th className="dr-num-cell">文档</th>
                  <th className="dr-num-cell">参与人</th>
                  <th className="dr-num-cell">Wiki</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {m.benchmarks.map((b) => {
                  const tag = benchmarkTag(b.stageCodes, b.wikiRecallCount);
                  return (
                    <tr key={b.workItemId}>
                      <td>{b.title}</td>
                      <td>{b.businessDomain ?? '-'}</td>
                      <td>
                        <span className="dr-stage-dots">
                          {STAGE_ORDER.map((code) => (
                            <i key={code} className={b.stageCodes.includes(code) ? 'dr-on' : ''} />
                          ))}
                        </span>
                      </td>
                      <td className="dr-num-cell">{b.documentCount}</td>
                      <td className="dr-num-cell">{b.contributorCount}</td>
                      <td className="dr-num-cell">{b.wikiRecallCount}</td>
                      <td><span className={`dr-tag ${tag.cls}`}>{tag.text}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="dr-section">
        <div className="dr-section-title"><span className="dr-num">{m.benchmarks.length > 0 ? '5' : '4'}.</span><span className="dr-text">知识库使用</span></div>
        <div className="dr-compare">
          <PanelA title="召回规模">
            <ul>
              <li>昨日 Wiki 召回 <strong>{m.knowledge.wikiRecallCount}</strong> 次</li>
              <li>覆盖 <strong>{m.knowledge.distinctFileCount}</strong> 个知识文档</li>
              <li>涉及 <strong>{m.knowledge.distinctDomainCount}</strong> 个业务域</li>
            </ul>
          </PanelA>
          <PanelB title="Top 领域">
            <ul>
              {m.knowledge.topDomains.map((d) => (
                <li key={d.domain}>{d.domain}：{d.count} 次</li>
              ))}
              {m.knowledge.topDomains.length === 0 && <li>昨日无知识召回</li>}
            </ul>
          </PanelB>
        </div>
        <JudgeBlock title="判定：团队知识开始进入 SDD 流程" text={m.knowledge.summary} />
      </section>

      {m.dataHealth.warnings.length > 0 && (
        <div className="dr-judge" style={{ marginTop: 24 }}>
          <strong>数据提示</strong>
          {m.dataHealth.warnings.map((w, i) => (
            <p key={i} style={{ margin: '4px 0' }}>{w}</p>
          ))}
        </div>
      )}

      <footer className="dr-footer">
        <span>SDD 质量观测台 &middot; Daily Brief &middot; Internal Use Only</span>
        <span>
          {m.methodology.queryVersion} / {m.methodology.templateVersion}
        </span>
      </footer>
    </article>
  );
}

function KpiCard({ label, value, sub, subCls, progress, index }: {
  label: string;
  value: number;
  sub: string;
  subCls: string;
  progress: number;
  index: number;
}) {
  const displayed = useCountUp(value, 800, 280 + index * 80);
  return (
    <div className="dr-kpi" style={{ '--p': progress } as React.CSSProperties}>
      <div className="dr-label">{label}</div>
      <div className="dr-value">{displayed}</div>
      <div className={`dr-sub ${subCls}`}>{sub}</div>
    </div>
  );
}

function PanelA({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="dr-panel dr-a">
      <div className="dr-panel-head"><span className="dr-stamp">A</span><span>{title}</span></div>
      {children}
    </article>
  );
}

function PanelB({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="dr-panel dr-b">
      <div className="dr-panel-head"><span className="dr-stamp">B</span><span>{title}</span></div>
      {children}
    </article>
  );
}

function JudgeBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className="dr-judge">
      <strong>{title}</strong>
      {text}
    </div>
  );
}

function formatGenerated(iso: string): string {
  try {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day} ${h}:${min}`;
  } catch {
    return iso;
  }
}

function formatDeltaValue(delta: number): string {
  if (delta > 0) return `增加 ${delta}`;
  if (delta < 0) return `减少 ${Math.abs(delta)}`;
  return '持平';
}

function formatDeltaPercent(d: { delta: number; deltaRate: number | null }): string {
  if (d.deltaRate !== null && Math.abs(d.deltaRate) > 0.01) {
    const sign = d.delta > 0 ? '+' : '';
    return `${sign}${(d.deltaRate * 100).toFixed(1)}%`;
  }
  return formatDeltaValue(d.delta);
}
