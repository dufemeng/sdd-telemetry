import type { DailyReportMetrics } from '@sdd-telemetry/api';

export function renderHeadline(m: DailyReportMetrics): string {
  if (m.kpis.activeUsers.current === 0) {
    return '昨日未观测到有效 SDD 使用数据。请检查团队是否接入、OTel 上报是否正常、worker 是否完成清洗。';
  }
  const parts: string[] = [];
  parts.push(`昨天 ${m.kpis.activeUsers.current} 人使用 SDD`);
  parts.push(`覆盖 ${m.kpis.coveredWorkItems.current} 个需求`);
  if (m.codeImpact.codeWriteCount > 0) {
    parts.push(`参与 ${m.codeImpact.codeWriteCount} 次代码改动`);
  }
  if (m.kpis.documentOutputs.current > 0) {
    parts.push(`生成/更新 ${m.kpis.documentOutputs.current} 篇过程文档`);
  }
  if (m.chain.fullChainWorkItemCount > 0) {
    parts.push(`${m.chain.fullChainWorkItemCount} 个需求已进入 3+ 阶段全链路`);
  }
  return parts.join('，') + '。';
}

export function renderMarkdown(m: DailyReportMetrics): string {
  const lines: string[] = [];
  lines.push(`# SDD 团队工程效能简报｜${m.reportDate}`);
  lines.push('');
  lines.push(m.headline);
  lines.push('');
  lines.push('## 核心数据');
  lines.push(`- 活跃用户：${m.kpis.activeUsers.current} 人${formatDelta(m.kpis.activeUsers)}`);
  lines.push(`- Skill 调用：${m.kpis.skillUsages.current} 次${formatDelta(m.kpis.skillUsages)}`);
  lines.push(
    `- 覆盖需求：${m.kpis.coveredWorkItems.current} 个${formatDelta(m.kpis.coveredWorkItems)}`,
  );
  lines.push(
    `- 文档产出：${m.kpis.documentOutputs.current} 篇${formatDelta(m.kpis.documentOutputs)}`,
  );
  lines.push(
    `- 代码落地：改动 ${m.codeImpact.codeWriteCount} 次，读取 ${m.codeImpact.codeReadCount} 次，涉及 ${m.codeImpact.touchedFileCount} 个代码文件、${m.codeImpact.contributorCount} 位用户`,
  );
  if (m.kpis.wikiRecalls.current > 0) {
    lines.push(
      `- Wiki 访问：${m.kpis.wikiRecalls.current} 次，覆盖 ${m.knowledge.distinctFileCount} 个文件、${m.knowledge.distinctPathDimensionCount} 个路径维度`,
    );
  }
  lines.push('');
  lines.push('## SDD 链路');
  for (const stage of m.chain.stages) {
    lines.push(`- ${stage.label}：${stage.workItemCount} 个需求`);
  }
  lines.push(`- 3+ 阶段需求：${m.chain.fullChainWorkItemCount} 个`);
  lines.push('');
  if (m.benchmarks.length > 0) {
    lines.push('## 今日标杆');
    for (let i = 0; i < m.benchmarks.length; i++) {
      const b = m.benchmarks[i]!;
      lines.push(`${i + 1}. ${b.title}：${b.label}`);
    }
    lines.push('');
  }
  lines.push('## 代码落地');
  lines.push(m.codeImpact.summary);
  for (const repo of m.codeImpact.topRepositories) {
    lines.push(`- ${repo.repository}：改动 ${repo.writeCount} 次，读取 ${repo.readCount} 次`);
  }
  lines.push('');
  lines.push('查看详情：');
  lines.push(`- 总览：${m.links.overview}`);
  lines.push(`- 产出分析：${m.links.workItems}`);
  lines.push(`- 知识库分析：${m.links.wikiRecalls}`);

  if (m.dataHealth.warnings.length > 0) {
    lines.push('');
    lines.push('## 数据提示');
    for (const w of m.dataHealth.warnings) {
      lines.push(`- ${w}`);
    }
  }

  return lines.join('\n');
}

function formatDelta(d: { delta: number; deltaRate: number | null }): string {
  if (d.delta === 0) return '';
  const sign = d.delta > 0 ? '+' : '';
  if (d.deltaRate !== null && Math.abs(d.deltaRate) > 0.01) {
    return `，较前日 ${sign}${(d.deltaRate * 100).toFixed(1)}%`;
  }
  return `，较前日 ${sign}${d.delta}`;
}
