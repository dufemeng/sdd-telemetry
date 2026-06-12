import { useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { ProfileInspectorResponse } from '@sdd-telemetry/api';
import { FileJson } from 'lucide-react';
import { useShellContext } from '@/components/layout/useShellContext';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Panel } from '@/components/ui/Panel';
import { formatInteger, truncate } from '@/lib/format';
import { useProfileInspector } from './useProfiles';
import { normalizeProfilePresentation } from './profilePresentation';

type ConfigFileGroup = 'profile' | 'types' | 'registry' | 'runtime' | 'validation';

const CONFIG_FILE_GROUPS: Array<{ value: ConfigFileGroup; label: string }> = [
  { value: 'profile', label: '当前 profile' },
  { value: 'types', label: 'profile-types.ts' },
  { value: 'registry', label: 'profile-registry.ts' },
  { value: 'runtime', label: 'profile-runtime.ts' },
  { value: 'validation', label: 'profile-validation.ts' },
];

export default function ProfileInspectorPage() {
  const { profileId } = useShellContext();
  const inspector = useProfileInspector(profileId);
  const data = inspector.data;
  const presentation = normalizeProfilePresentation(data?.profile.presentation);
  const [configFileGroup, setConfigFileGroup] = useState<ConfigFileGroup>('profile');

  const configFile = useMemo(() => buildConfigFileView(data, presentation, configFileGroup), [data, presentation, configFileGroup]);

  if (inspector.isLoading) {
    return <div className="p-4 text-[13px] text-[var(--color-muted)]">加载中…</div>;
  }

  if (!data) {
    return <EmptyState text="暂无 Profile 配置数据" />;
  }

  return (
    <div>
      <Panel
        title="Profile 配置文件"
        icon={<FileJson size={18} />}
        headerRight={
          <SegmentGroup
            items={CONFIG_FILE_GROUPS}
            value={configFileGroup}
            onChange={setConfigFileGroup}
          />
        }
      >
        <PanelDescription>
          这里按拆分后的源码文件展示配置。每行只保留 key、description、value，方便把“这个字段在哪个文件里、它控制什么、当前值是什么”对上。
        </PanelDescription>
        <ProjectionDiagnostics data={data} />
        <SourceRuleOverview data={data} />
        <FileHeader title={configFile.title} filePath={configFile.filePath} />
        <DataTable
          headers={['key', 'description', 'value']}
          rows={configFile.rows}
          emptyText="暂无配置项"
        />
      </Panel>
    </div>
  );
}

function ProjectionDiagnostics({ data }: { data: ProfileInspectorResponse }) {
  const job = data.projection.job;
  const currentRun = data.projection.currentRun;
  const lastError = job?.lastError ?? currentRun?.errorMessage ?? data.projection.latestRun?.errorMessage ?? null;
  const items = [
    {
      label: 'profile_source_matches',
      value: formatInteger(data.projection.matchCounts.sourceMatches),
      detail: 'source-backed profile 的路径规则命中数',
      tone: data.projection.matchCounts.sourceMatches > 0 ? 'good' : 'warn',
    },
    {
      label: 'profile_projection_jobs',
      value: job ? formatProjectionJobStatus(job.status) : '尚未创建',
      detail: job ? `dirtySeq ${formatInteger(job.dirtySeq)} · attempts ${formatInteger(job.attempts)}/${formatInteger(job.maxAttempts)}` : 'worker 尚未维护过该 profile',
      tone: job?.status === 'failed' ? 'bad' : job?.status === 'dirty' || job?.status === 'running' ? 'warn' : 'good',
    },
    {
      label: 'last_error',
      value: lastError ? '有错误' : '无',
      detail: lastError ? truncate(lastError, 160) : '最近一次投影没有记录错误',
      tone: lastError ? 'bad' : 'good',
    },
    {
      label: 'currentRun',
      value: currentRun ? `#${currentRun.id}` : '无',
      detail: currentRun ? `${currentRun.status} · ${currentRun.completedAt ?? currentRun.startedAt ?? '无时间'}` : '普通看板会返回空数据，直到 current pointer 存在',
      tone: currentRun ? 'good' : 'warn',
    },
  ];

  return (
    <section className="mb-4 grid gap-2 md:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-[6px] px-3 py-2"
          style={{ border: `1px solid ${diagnosticToneBorder(item.tone)}`, background: diagnosticToneBackground(item.tone) }}
        >
          <div className="text-[10px] text-[var(--color-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
            {item.label}
          </div>
          <div className="mt-1 text-[14px] font-semibold text-[#f5f5f5]" style={{ fontFamily: 'var(--font-mono)' }}>
            {item.value}
          </div>
          <div className="mt-1 min-h-[32px] text-[11px] leading-4 text-[var(--color-muted)]">
            {item.detail}
          </div>
        </div>
      ))}
    </section>
  );
}

function SourceRuleOverview({ data }: { data: ProfileInspectorResponse }) {
  const sourceRules = data.rules.sourceRules.filter((rule) => rule.enabled !== false);
  const runtimeRules = new Map(data.runtime.resolvedSourceRules.map((rule) => [rule.ruleId, rule]));

  if (sourceRules.length === 0) {
    return (
      <section className="mb-4 rounded-[6px]" style={{ border: '1px solid var(--color-border)', background: '#0d0d0d' }}>
        <div className="px-3 py-2">
          <div className="text-[12px] font-semibold text-[#f5f5f5]">原始配置规则如何生效</div>
          <p className="mt-1 text-[12px] leading-5 text-[var(--color-muted)]">
            当前 profile 不通过 sourceRules 匹配路径。它使用已有 sdd_* 派生表桥接到 profile 看板，清洗链路仍由 worker 自动维护。
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-4 rounded-[6px]" style={{ border: '1px solid var(--color-border)', background: '#0d0d0d' }}>
      <div className="border-b px-3 py-2" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-[12px] font-semibold text-[#f5f5f5]">原始配置规则如何生效</div>
          <span className="rounded-full px-2 py-[2px] text-[10px] text-[var(--color-primary)]" style={{ background: 'rgba(250,255,105,0.10)' }}>
            {sourceRules.length} 条入口规则
          </span>
        </div>
        <p className="mt-1 max-w-[82ch] text-[12px] leading-5 text-[var(--color-muted)]">
          用户在 Claude/Codex 里读取、搜索、写入或编辑文件时，工具调用会上报 file_path。worker 先把这些调用清洗成 source_references，再用下面的规则判断它属于过程文档、知识库还是代码，最后进入当前 profile 的投影看板。
        </p>
      </div>
      <div className="divide-y divide-[var(--color-border)]">
        {sourceRules.map((rule) => {
          const runtimeRule = runtimeRules.get(stringField(rule, 'ruleId'));
          return (
            <div key={stringField(rule, 'ruleId')} className="grid gap-3 px-3 py-3 md:grid-cols-[160px_minmax(0,1fr)_minmax(220px,0.75fr)]">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex h-[20px] items-center rounded-full px-2 text-[11px] font-medium"
                    style={categoryBadgeStyle(rule.category)}
                  >
                    {formatSourceCategory(rule.category)}
                  </span>
                </div>
                <div className="mt-2 text-[11px] text-[var(--color-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
                  {stringField(rule, 'ruleId')}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[var(--color-muted)]">识别路径</div>
                <div className="mt-1 grid gap-1">
                  {sourcePathSignals(rule, runtimeRule).map((item) => (
                    <code
                      key={item}
                      className="block break-all rounded-[4px] px-2 py-1 text-[12px] text-[var(--color-secondary)]"
                      style={{ background: '#151515', fontFamily: 'var(--font-mono)' }}
                    >
                      {item}
                    </code>
                  ))}
                </div>
                <div className="mt-2 text-[11px] leading-4 text-[var(--color-muted)]">
                  {sourceRootSummary(rule, runtimeRule)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[var(--color-muted)]">用户操作触发</div>
                <div className="mt-1 text-[12px] leading-5 text-[var(--color-secondary)]">
                  {formatActions(rule.actions)}
                </div>
                <div className="mt-2 text-[11px] leading-4 text-[var(--color-muted)]">
                  {sourceEffectSummary(rule)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PanelDescription({ children }: { children: ReactNode }) {
  return (
    <p className="mb-3 max-w-[75ch] text-[12px] leading-5 text-[var(--color-muted)]">
      {children}
    </p>
  );
}

function FileHeader({ title, filePath }: { title: string; filePath: string }) {
  return (
    <div
      className="mb-3 rounded-[4px] px-3 py-2"
      style={{ border: '1px solid var(--color-border)', background: '#171717' }}
    >
      <div className="text-[12px] font-semibold text-[#f5f5f5]">{title}</div>
      <div className="mt-1 text-[11px] text-[var(--color-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
        {filePath}
      </div>
    </div>
  );
}

function SegmentGroup({
  items,
  value,
  onChange,
}: {
  items: Array<{ value: ConfigFileGroup; label: string }>;
  value: ConfigFileGroup;
  onChange: (value: ConfigFileGroup) => void;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-[4px]" style={{ border: '1px solid var(--color-border)' }}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          onClick={() => onChange(item.value)}
          className={[
            'min-h-8 px-3 text-[12px] transition-colors whitespace-nowrap',
            value === item.value
              ? 'bg-[#2b2b20] text-[var(--color-primary)]'
              : 'bg-transparent text-[var(--color-secondary)] hover:text-[#f5f5f5]',
          ].join(' ')}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

interface ConfigFileView {
  title: string;
  filePath: string;
  rows: ReactNode[][];
}

function buildConfigFileView(
  data: ProfileInspectorResponse | undefined,
  presentation: ReturnType<typeof normalizeProfilePresentation>,
  group: ConfigFileGroup,
): ConfigFileView {
  if (!data) {
    return {
      title: 'Profile 配置',
      filePath: 'packages/api/src/profile-config',
      rows: [],
    };
  }

  if (group === 'profile') {
    return {
      title: `${data.profile.displayName} 实例配置`,
      filePath: `packages/api/src/profile-config/profiles/${profileFileName(data.profile.profileId)}`,
      rows: [
        configRow('profileId', 'URL、API、下拉框使用的稳定 ID。', data.profile.profileId),
        configRow('displayName', '页面展示名称。', data.profile.displayName),
        configRow('status', '是否作为正式入口启用。', formatProfileStatus(data.profile.status)),
        configRow('projectionMode', 'worker 用哪套投影算子处理这个 profile。', formatProjectionMode(data.profile.projectionMode)),
        configRow('manifest', '这个 profile 对页面承诺有哪些看板能力。', formatManifest(data.profile.manifest)),
        configRow('sourceRules', '识别“这个 source 是过程文档、知识库还是代码”的规则。', sourceRuleSummaries(data.rules.sourceRules)),
        configRow('deliveryUnitRules', '把过程文档路径解析成交付单元。', deliveryRuleSummaries(data.rules.deliveryUnitRules)),
        configRow('artifactRules', '把过程文档写入解析成 plan/design/task/review 等产物类型。', artifactRuleSummaries(data.rules.artifactRules)),
        configRow('capabilityRules', '把 source + action 聚合成页面里的能力调用。', capabilityRuleSummaries(data.rules.capabilityRules)),
        configRow('attributionPolicy', '把知识库读取、代码实施归因到最近的过程文档交付单元。', attributionSummary(data.rules.attributionPolicy)),
        configRow('presentation', '只影响页面文案、阶段顺序和降级策略，不改变清洗结果。', presentationSummary(presentation)),
      ],
    };
  }

  if (group === 'types') {
    return {
      title: '配置语言定义',
      filePath: 'packages/api/src/profile-config/profile-types.ts',
      rows: [
        configRow('WorkflowProfileConfig', '一个 profile 的完整契约，所有实例文件都必须满足它。', 'profileId, displayName, status, projectionMode, manifest, sourceRules, deliveryUnitRules, artifactRules, capabilityRules, attributionPolicy, presentation'),
        configRow('SourceRule', '来源识别规则，只负责分类，不直接写看板表。', `${formatInteger(data.rules.sourceRules.length)} 条来源规则`),
        configRow('SourceCategory', '来源进入观测模型后的业务类别。', 'process_doc（过程文档）, knowledge（知识库）, code（代码）, unknown（兜底）'),
        configRow('SourceAction', '从工具调用标准化出来的动作。', 'read, grep, glob, write, edit, update, delete'),
        configRow('DeliveryUnitRule', '把 process_doc source 转成交付单元。', `${formatInteger(data.rules.deliveryUnitRules.length)} 条交付单元规则`),
        configRow('ArtifactRule', '把 process_doc source 转成产物和产物写入。', `${formatInteger(data.rules.artifactRules.length)} 条产物规则`),
        configRow('CapabilityRule', '把 source/action 转成能力使用记录。', `${formatInteger(data.rules.capabilityRules.length)} 条能力规则`),
        configRow('AttributionPolicy', '定义非过程文档事实如何挂回交付单元。', attributionSummary(data.rules.attributionPolicy)),
        configRow('ProfilePresentationConfig', '定义页面展示文案和降级策略。', presentationSummary(presentation)),
      ],
    };
  }

  if (group === 'registry') {
    return {
      title: 'Profile 配置目录',
      filePath: 'packages/api/src/profile-config/profile-catalog.ts',
      rows: [
        configRow('ProfileConfigCatalog', '读取数据库 published 配置，并在缺失时回退内置模板。', [
          'DB published -> profile_config_versions.config_json',
          'fallback -> packages/api/src/profile-config/profiles/*.ts',
        ]),
        configRow('getPublished(profileId)', 'server/worker 按当前 profileId 取已发布配置快照。', `当前返回 ${data.profile.profileId}`),
        configRow('listPublished()', 'Profile 下拉框和配置列表读取 published 配置集合。', 'DB 优先，builtin fallback 补齐'),
        configRow('内置模板', '数据库未 seed 或回滚时的兼容模板。', `profiles/${profileFileName(data.profile.profileId)}`),
      ],
    };
  }

  if (group === 'runtime') {
    return {
      title: '运行期解析',
      filePath: 'packages/api/src/profile-config/profile-runtime.ts',
      rows: [
        configRow('resolveRuntimeProfileConfig', '把 sourceRules 里的 rootEnv/rootPath/fallbackBaseEnv 解析成本机可用规则。', `${formatInteger(data.runtime.resolvedRuleCount)} 条已解析`),
        configRow('root 解析优先级', '本地路径规则如何找到真实根目录。', 'env[rootEnv] -> rootPath -> env[fallbackBaseEnv] + relativeRoot -> pathContains/pathRegexes 模糊匹配'),
        configRow('resolvedSourceRules', '当前环境已经可用于匹配 source_references 的规则。', resolvedRuleSummaries(data.runtime.resolvedSourceRules)),
        configRow('unresolved', '启用但当前环境不可解析的规则。', data.runtime.unresolved.length === 0 ? '无' : data.runtime.unresolved.map((item) => `${item.ruleId}: ${translateRuntimeReason(item.reason)}`)),
        configRow('profile_projection_jobs', '后台自动维护这个 profile 的投影任务状态。', projectionJobSummary(data)),
        configRow('profile_source_matches', 'source-backed profile 的来源匹配物化结果，投影前会全量重匹配。', `${formatInteger(data.projection.matchCounts.sourceMatches)} 条匹配`),
        configRow('last_resolved_config_hash', '运行时配置 hash，包含 env 解析后的真实 root，用来发现配置变化。', data.projection.job?.lastResolvedConfigHash ?? '尚未成功投影'),
        configRow('sort order', '多条规则同时可用时的排序。', 'confidence 高优先，然后 priority 大优先，然后 ruleId 字典序'),
      ],
    };
  }

  return {
    title: '配置校验',
    filePath: 'packages/api/src/profile-config/profile-validation.ts',
    rows: [
      configRow('validateProfileConfig', '静态检查配置是否自洽。', data.validation.valid ? '通过' : `${data.validation.issues.length} 个问题`),
      configRow('duplicate sourceRule ruleId', '同一个 profile 下 source rule ID 不能重复。', data.validation.valid ? '未命中' : validationIssuesFor(data, 'duplicate')),
      configRow('path/url/mcp_doc required matcher', '不同定位器必须配置足够的匹配条件。', data.validation.valid ? '未命中' : validationIssuesFor(data, 'needs')),
      configRow('unknown sourceRuleId reference', 'delivery/artifact/capability 不能引用不存在的 source rule。', data.validation.valid ? '未命中' : validationIssuesFor(data, 'unknown sourceRuleId')),
      configRow('capability target', 'capabilityRule 必须通过 sourceRuleIds 或 sourceCategories 指明来源。', data.validation.valid ? '未命中' : validationIssuesFor(data, 'capabilityRule needs')),
    ],
  };
}

function mono(value: ReactNode): ReactNode {
  return <span style={{ fontFamily: 'var(--font-mono)' }}>{value}</span>;
}

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return value == null ? '—' : String(value);
}

function joinField(value: unknown): string {
  if (!Array.isArray(value)) return value == null ? '—' : String(value);
  return value.length === 0 ? '—' : value.map((item) => String(item)).join(', ');
}

function configRow(key: string, description: string, value: unknown): ReactNode[] {
  return [mono(key), description, <ConfigValue key={key} value={value} />];
}

function ConfigValue({ value }: { value: unknown }) {
  if (Array.isArray(value)) {
    if (value.length === 0) return <span>—</span>;
    return (
      <div className="grid gap-1">
        {value.map((item, index) => (
          <span key={`${index}-${String(item).slice(0, 24)}`} className="block text-[var(--color-secondary)]">
            {truncate(item, 240)}
          </span>
        ))}
      </div>
    );
  }
  return <span className="text-[var(--color-secondary)]">{truncate(value, 260)}</span>;
}

function profileFileName(profileId: string): string {
  const known: Record<string, string> = {
    'sdd-default': 'sdd-default.ts',
    'e2e-monorepo': 'e2e-monorepo.ts',
    'online-docs': 'online-docs.ts',
  };
  return known[profileId] ?? `${profileId}.ts`;
}

function formatManifest(manifest: Record<string, unknown>): string[] {
  const enabled = Object.entries(manifest).filter(([, value]) => value === true).map(([key]) => key);
  const disabled = Object.entries(manifest).filter(([, value]) => value === false).map(([key]) => key);
  return [
    `开启：${enabled.length ? enabled.join(', ') : '无'}`,
    `关闭：${disabled.length ? disabled.join(', ') : '无'}`,
  ];
}

function sourceRuleSummaries(rules: Array<Record<string, unknown>>): string[] {
  if (rules.length === 0) return ['无来源规则'];
  return rules.map((rule) => [
    `${stringField(rule, 'ruleId')}：${formatSourceCategory(rule.category)}`,
    `定位=${formatLocatorType(rule.locatorType)}`,
    `动作=${formatActions(rule.actions)}`,
    `根目录=${formatRootSetting(rule)}`,
    `include=${joinField(rule.includeGlobs)}`,
    `exclude=${joinField(rule.excludeGlobs)}`,
  ].join('；'));
}

function sourcePathSignals(
  rule: Record<string, unknown>,
  runtimeRule: ProfileInspectorResponse['runtime']['resolvedSourceRules'][number] | undefined,
): string[] {
  const pathContains = stringArrayField(rule.pathContains).map(cleanPathSignal);
  if (pathContains.length > 0) return pathContains;

  const urlPrefixes = stringArrayField(rule.urlPrefixes);
  if (urlPrefixes.length > 0) return urlPrefixes;

  const docIdPatterns = stringArrayField(rule.docIdPatterns);
  if (docIdPatterns.length > 0) return docIdPatterns.map((item) => `docId: ${item}`);

  if (runtimeRule?.resolvedRoot) return [runtimeRule.resolvedRoot];

  const root = sourceConfiguredRoot(rule);
  return root ? [root] : ['未配置路径信号'];
}

function sourceRootSummary(
  rule: Record<string, unknown>,
  runtimeRule: ProfileInspectorResponse['runtime']['resolvedSourceRules'][number] | undefined,
): string {
  const configuredRoot = sourceConfiguredRoot(rule);
  const resolvedRoot = runtimeRule?.resolvedRoot;
  if (resolvedRoot) return `当前环境已解析 root：${resolvedRoot}`;
  if (configuredRoot) return `可选精确 root：${configuredRoot}。未配置时继续使用上面的路径片段模糊匹配。`;
  return '当前规则依赖路径片段、URL 前缀或文档 ID 模式匹配，不要求绝对路径。';
}

function sourceConfiguredRoot(rule: Record<string, unknown>): string {
  const rootEnv = stringField(rule, 'rootEnv');
  if (rootEnv !== '—') return `$${rootEnv}`;

  const rootPath = stringField(rule, 'rootPath');
  if (rootPath !== '—') return rootPath;

  const fallbackBaseEnv = stringField(rule, 'fallbackBaseEnv');
  if (fallbackBaseEnv !== '—') {
    const relativeRoot = stringField(rule, 'relativeRoot');
    return relativeRoot === '—' || relativeRoot === '.' ? `$${fallbackBaseEnv}` : `$${fallbackBaseEnv}/${relativeRoot}`;
  }

  return '';
}

function sourceEffectSummary(rule: Record<string, unknown>): string {
  const category = String(rule.category ?? '');
  if (category === 'process_doc') {
    return '写入或编辑过程文档会生成交付单元和产物；这些写入也是知识库读取、代码实施归因时优先寻找的锚点。';
  }
  if (category === 'knowledge') {
    return '读取或搜索知识库会生成知识召回记录，并按最近的过程文档写入归因到交付单元。';
  }
  if (category === 'code') {
    return '写入、编辑、更新或删除代码会生成代码实施记录，并按最近的过程文档写入归因到交付单元。';
  }
  return '命中后进入 source-backed 投影，是否进入核心指标由后续 delivery/artifact/capability 规则决定。';
}

function categoryBadgeStyle(value: unknown): CSSProperties {
  const category = String(value ?? '');
  if (category === 'process_doc') return { color: 'var(--color-primary)', background: 'rgba(250,255,105,0.10)' };
  if (category === 'knowledge') return { color: 'var(--color-good-text)', background: 'var(--color-good-bg)' };
  if (category === 'code') return { color: 'var(--color-warn-text)', background: 'var(--color-warn-bg)' };
  return { color: 'var(--color-secondary)', background: 'rgba(255,255,255,0.08)' };
}

function diagnosticToneBackground(tone: string): string {
  if (tone === 'good') return 'rgba(34,197,94,0.06)';
  if (tone === 'warn') return 'rgba(245,158,11,0.08)';
  if (tone === 'bad') return 'rgba(239,68,68,0.12)';
  return '#101010';
}

function diagnosticToneBorder(tone: string): string {
  if (tone === 'good') return 'rgba(34,197,94,0.22)';
  if (tone === 'warn') return 'rgba(245,158,11,0.26)';
  if (tone === 'bad') return 'rgba(255,180,171,0.30)';
  return 'var(--color-border)';
}

function stringArrayField(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter(Boolean);
}

function cleanPathSignal(value: string): string {
  const withoutLeadingSlash = value.replace(/^\/+/, '');
  return withoutLeadingSlash.endsWith('/') ? withoutLeadingSlash : `${withoutLeadingSlash}/`;
}

function deliveryRuleSummaries(rules: Array<Record<string, unknown>>): string[] {
  if (rules.length === 0) return ['无交付单元规则'];
  return rules.map((rule) => [
    `${stringField(rule, 'ruleId')}：关联 ${joinField(rule.sourceRuleIds)}`,
    `定位策略=${truncate(rule.locatorStrategy, 100)}`,
    `标题策略=${formatTitleStrategy(rule.titleStrategy)}`,
  ].join('；'));
}

function artifactRuleSummaries(rules: Array<Record<string, unknown>>): string[] {
  if (rules.length === 0) return ['无产物规则'];
  return rules.map((rule) => [
    `${stringField(rule, 'ruleId')}：关联 ${joinField(rule.sourceRuleIds)}`,
    `默认类型=${stringField(rule, 'defaultArtifactType')}`,
    `类型模式=${formatArtifactPatterns(rule.typePatterns)}`,
  ].join('；'));
}

function capabilityRuleSummaries(rules: Array<Record<string, unknown>>): string[] {
  if (rules.length === 0) return ['无能力规则'];
  return rules.map((rule) => [
    `${stringField(rule, 'ruleId')}：${stringField(rule, 'displayName')}`,
    `code=${stringField(rule, 'capabilityCode')}`,
    `来源=${joinField(rule.sourceRuleIds) || formatSourceCategories(rule.sourceCategories)}`,
    `动作=${formatActions(rule.actions)}`,
  ].join('；'));
}

function attributionSummary(policy: Record<string, unknown>): string[] {
  const sameInteraction = policy.sameInteraction as Record<string, unknown> | undefined;
  const sameSessionWindow = policy.sameSessionWindow as Record<string, unknown> | undefined;
  return [
    `锚点来源：${formatSourceCategories(policy.anchorCategories)}`,
    `锚点动作：${formatActions(policy.anchorActions)}`,
    `同 interaction：${formatBoolean(sameInteraction?.enabled)}，优先动作 ${formatActions(sameInteraction?.preferActions)}`,
    `同 session 窗口：${formatBoolean(sameSessionWindow?.enabled)}，${String(sameSessionWindow?.minutes ?? 0)} 分钟，要求同用户=${formatBoolean(sameSessionWindow?.requireSameUser)}`,
  ];
}

function presentationSummary(presentation: ReturnType<typeof normalizeProfilePresentation>): string[] {
  return [
    `工作流类型：${formatWorkflowKind(presentation.workflowKind)}`,
    `看板标题：${presentation.labels.dashboardTitle}`,
    `交付单元名词：${presentation.labels.deliveryUnitPlural}`,
    `产物阶段：${presentation.stages.artifactStages.map((stage) => stage.label).join(' -> ') || '无'}`,
    `用户成熟度阶段：${presentation.stages.maturityStages.map((stage) => stage.label).join(' -> ') || '不展示'}`,
    `知识覆盖口径：${formatKnowledgeCoverage(presentation.widgets.knowledgeCoverage)}`,
    `旧 SDD 专属页面：${formatLegacySurfaces(presentation.legacyOnlySurfaces)}`,
  ];
}

function resolvedRuleSummaries(rules: ProfileInspectorResponse['runtime']['resolvedSourceRules']): string[] {
  if (rules.length === 0) return ['无已解析规则'];
  return rules.map((rule) => [
    `${rule.ruleId}：${formatSourceCategory(rule.category)}`,
    `定位=${formatLocatorType(rule.locatorType)}`,
    `root=${rule.resolvedRoot ?? '模糊匹配 / 远程定位器'}`,
    `可信度=${formatConfidence(rule.confidence)}`,
  ].join('；'));
}

function projectionJobSummary(data: ProfileInspectorResponse): string[] {
  const job = data.projection.job;
  if (!job) return ['尚未创建维护任务'];
  return [
    `状态：${formatProjectionJobStatus(job.status)}`,
    `dirtySeq：${formatInteger(job.dirtySeq)}`,
    `原因：${job.dirtyReason ?? '—'}`,
    `尝试次数：${formatInteger(job.attempts)} / ${formatInteger(job.maxAttempts)}`,
    `最近完成：${job.lastCompletedAt ?? '—'}`,
    `最近 run：${job.lastProjectionRunId ?? '—'}`,
    `错误：${job.lastError ? truncate(job.lastError, 120) : '—'}`,
  ];
}

function validationIssuesFor(data: ProfileInspectorResponse, keyword: string): string[] | string {
  const issues = data.validation.issues
    .filter((item) => item.message.includes(keyword))
    .map((item) => `${item.ruleId ?? 'profile'}：${translateValidationMessage(item.message)}`);
  return issues.length ? issues : '未命中';
}

function formatProjectionJobStatus(value: string): string {
  const labels: Record<string, string> = {
    idle: '空闲',
    dirty: '等待投影',
    running: '投影中',
    failed: '失败待重试',
  };
  return labels[value] ?? value;
}

function formatRootSetting(rule: Record<string, unknown>): string {
  const rootEnv = stringField(rule, 'rootEnv');
  if (rootEnv !== '—') return `$${rootEnv}`;
  const rootPath = stringField(rule, 'rootPath');
  if (rootPath !== '—') return rootPath;
  const fallbackBaseEnv = stringField(rule, 'fallbackBaseEnv');
  if (fallbackBaseEnv !== '—') return `$${fallbackBaseEnv}/${stringField(rule, 'relativeRoot')}`;
  return joinField(rule.pathContains) || joinField(rule.pathRegexes);
}

function formatArtifactPatterns(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return '—';
  return value.map((item) => {
    if (!item || typeof item !== 'object') return String(item);
    const record = item as Record<string, unknown>;
    return `${stringField(record, 'artifactType')} <- ${joinField(record.include)}`;
  }).join(', ');
}

const WORKFLOW_KIND_LABELS: Record<string, string> = {
  sdd: 'SDD 默认工作流',
  local_path_monorepo: '本地路径 Monorepo 工作流',
  online_docs: '在线文档工作流',
};

const PROJECTION_MODE_LABELS: Record<string, string> = {
  sdd_bridge: '旧 SDD 桥接',
  source_backed: '通用来源投影',
};

const PROFILE_STATUS_LABELS: Record<string, string> = {
  active: '已启用',
  disabled: '未启用',
};

const SOURCE_CATEGORY_LABELS: Record<string, string> = {
  process_doc: '过程文档',
  knowledge: '知识库',
  code: '代码',
  unknown: '未知',
};

const LOCATOR_TYPE_LABELS: Record<string, string> = {
  path: '本地路径',
  url: 'URL',
  mcp_doc: 'MCP 文档',
};

const CONFIDENCE_LABELS: Record<string, string> = {
  high: '高',
  medium: '中',
  low: '低',
};

const ACTION_LABELS: Record<string, string> = {
  read: '读取',
  grep: '搜索',
  glob: '列目录',
  write: '写入',
  edit: '编辑',
  update: '更新',
  delete: '删除',
};

const ARTIFACT_FUNNEL_LABELS: Record<string, string> = {
  sdd_stage: '按 SDD 阶段',
  artifact_type: '按产物类型',
  none: '不展示',
};

const KNOWLEDGE_COVERAGE_LABELS: Record<string, string> = {
  filesystem_scan: '文件系统扫描',
  recall_facts: '只按召回事实',
};

const LEGACY_SURFACE_LABELS: Record<string, string> = {
  semantics: 'SDD 语义映射',
  dailyReport: 'SDD 日报',
};

const TITLE_STRATEGY_LABELS: Record<string, string> = {
  unit_slug: '使用交付单元 slug',
  file_name: '使用文件名',
  doc_title: '使用文档标题',
  none: '不生成标题',
};

function labelFrom(labels: Record<string, string>, value: unknown): string {
  if (value == null || value === '') return '—';
  const key = String(value);
  return labels[key] ?? key;
}

function formatProjectionMode(value: string): string {
  return labelFrom(PROJECTION_MODE_LABELS, value);
}

function formatProfileStatus(value: string): string {
  return labelFrom(PROFILE_STATUS_LABELS, value);
}

function formatWorkflowKind(value: string): string {
  return labelFrom(WORKFLOW_KIND_LABELS, value);
}

function formatSourceCategory(value: unknown): string {
  return labelFrom(SOURCE_CATEGORY_LABELS, value);
}

function formatSourceCategories(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return '—';
  return value.map(formatSourceCategory).join(', ');
}

function formatLocatorType(value: unknown): string {
  return labelFrom(LOCATOR_TYPE_LABELS, value);
}

function formatConfidence(value: unknown): string {
  return labelFrom(CONFIDENCE_LABELS, value);
}

function formatActions(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return '—';
  return value.map((item) => labelFrom(ACTION_LABELS, item)).join(', ');
}

function formatArtifactCoverageFunnel(value: string): string {
  return labelFrom(ARTIFACT_FUNNEL_LABELS, value);
}

function formatKnowledgeCoverage(value: string): string {
  return labelFrom(KNOWLEDGE_COVERAGE_LABELS, value);
}

function formatLegacySurfaces(values: string[]): string {
  if (values.length === 0) return '无';
  return values.map((value) => labelFrom(LEGACY_SURFACE_LABELS, value)).join(', ');
}

function formatBoolean(value: unknown): string {
  if (value === true) return '是';
  if (value === false) return '否';
  return value == null ? '—' : String(value);
}

function formatTitleStrategy(value: unknown): string {
  return labelFrom(TITLE_STRATEGY_LABELS, value);
}

function translateRuntimeReason(reason: string): string {
  return reason
    .replace('missing env', '缺少环境变量')
    .replace('missing root', '缺少根目录')
    .replace('not configured', '未配置')
    .replace('not found', '未找到');
}

function translateValidationMessage(message: string): string {
  return message
    .replace('duplicate sourceRule ruleId', 'sourceRule ruleId 重复')
    .replace('path rule needs rootEnv, rootPath, fallbackBaseEnv + relativeRoot, pathContains, or pathRegexes', 'path 规则需要 rootEnv、rootPath、fallbackBaseEnv + relativeRoot、pathContains 或 pathRegexes 之一')
    .replace('url rule needs urlPrefixes or urlRegexes', 'URL 规则需要 urlPrefixes 或 urlRegexes')
    .replace('mcp_doc rule needs at least one of docIdPatterns / collectionIds / urlPrefixes / docTypes (mcpServer alone is not enough)', 'MCP 文档规则至少需要 docIdPatterns、collectionIds、urlPrefixes 或 docTypes 之一，只有 mcpServer 不足以分类')
    .replace('deliveryUnitRule references unknown sourceRuleId:', '交付单元规则引用了不存在的 sourceRuleId：')
    .replace('artifactRule references unknown sourceRuleId:', '产物规则引用了不存在的 sourceRuleId：')
    .replace('capabilityRule references unknown sourceRuleId:', '能力规则引用了不存在的 sourceRuleId：')
    .replace('capabilityRule needs sourceRuleIds or sourceCategories', '能力规则需要 sourceRuleIds 或 sourceCategories');
}
