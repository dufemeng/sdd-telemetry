import type { WorkflowProfileConfig } from '@sdd-telemetry/api';
import { StatusBadge } from '@/components/ui/StatusBadge';
import {
  CONTENT_SOURCE_TYPE_DESC,
  CONTENT_SOURCE_TYPE_LABEL,
  availableSourceTypes,
  type ContentRow,
  type ContentSourceType,
  decodeContentRows,
  encodeContentRows,
} from './config-authoring';
import { ConfigGroup, Field, INPUT_CLASS, TEXTAREA_CLASS, Warn, linesToArray } from './config-ui';

export function ContentMapSection({
  config,
  onChange,
  readOnly = false,
}: {
  config: WorkflowProfileConfig;
  onChange: (next: WorkflowProfileConfig) => void;
  readOnly?: boolean;
}) {
  const rows = decodeContentRows(config);

  function updateRow(kind: ContentRow['kind'], patch: Partial<ContentRow>) {
    const nextRows = rows.map((row) => (row.kind === kind ? { ...row, ...patch } : row));
    onChange(encodeContentRows(config, nextRows));
  }

  if (readOnly) {
    return (
      <ConfigGroup title="内容来源" action={<InlineCount value={`${rows.filter((row) => row.present).length}/${rows.length}`} />}>
        <div className="overflow-hidden rounded-[4px] border border-[var(--color-border)]">
          <table className="w-full border-collapse text-[12px]">
            <thead className="bg-[#171717] text-[10px] font-bold uppercase tracking-[0.05em] text-[var(--color-muted)]">
              <tr>
                <th className="px-3 py-2 text-left">配置项</th>
                <th className="px-3 py-2 text-left">来源规则</th>
                <th className="px-3 py-2 text-left">明细</th>
                <th className="px-3 py-2 text-right">状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)] bg-[#101010]">
              {rows.map((row) => (
                <ContentSourceSummary key={row.kind} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      </ConfigGroup>
    );
  }

  return (
    <ConfigGroup title="内容来源">
      <div className="grid gap-2.5">
        {rows.map((row) => (
          <ContentSourceEditor key={row.kind} row={row} onChange={(patch) => updateRow(row.kind, patch)} />
        ))}
      </div>
    </ConfigGroup>
  );
}

function ContentSourceSummary({ row }: { row: ContentRow }) {
  return (
    <tr>
      <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-[#f5f5f5]">{sourceTitle(row.kind)}</td>
      <td className="whitespace-nowrap px-3 py-2.5 text-[var(--color-secondary)]">{CONTENT_SOURCE_TYPE_LABEL[row.sourceType]}</td>
      <td className="min-w-0 px-3 py-2.5">
        <div className="max-w-[520px] truncate font-mono text-[11px] text-[var(--color-muted)]" title={summarizeContentRow(row)}>
          {summarizeContentRow(row)}
        </div>
      </td>
      <td className="px-3 py-2.5 text-right">
        <StatusBadge status={row.present ? '已配置' : '缺失'} variant={row.present ? 'good' : 'bad'} />
      </td>
    </tr>
  );
}

function InlineCount({ value }: { value: string }) {
  return <span className="font-mono text-[11px] text-[var(--color-muted)]">{value}</span>;
}

function ContentSourceEditor({ row, onChange }: { row: ContentRow; onChange: (patch: Partial<ContentRow>) => void }) {
  const types = availableSourceTypes(row.kind);
  const options = types.includes(row.sourceType) ? types : [row.sourceType, ...types];

  return (
    <div className="grid gap-3 rounded-[6px] border border-[var(--color-border)] bg-[#141414] p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[13px] font-semibold text-[#f5f5f5]">{sourceTitle(row.kind)}</div>
          <div className="mt-0.5 text-[11px] text-[var(--color-muted)]">{CONTENT_SOURCE_TYPE_DESC[row.sourceType]}</div>
        </div>
        <StatusBadge status={row.present ? '已配置' : '缺失'} variant={row.present ? 'good' : 'bad'} />
      </div>

      {!row.present ? (
        <Warn>缺少这类来源规则，当前页面不能直接补出底层规则。</Warn>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[260px_minmax(0,1fr)]">
        <Field label="来源类型">
          <select
            className={INPUT_CLASS}
            disabled={!row.present}
            value={row.sourceType}
            onChange={(event) => onChange({ sourceType: event.target.value as ContentSourceType })}
          >
            {options.map((type) => (
              <option key={type} value={type}>
                {CONTENT_SOURCE_TYPE_LABEL[type]}
              </option>
            ))}
          </select>
        </Field>
        <ContentRowInput row={row} onChange={onChange} />
      </div>
    </div>
  );
}

function ContentRowInput({ row, onChange }: { row: ContentRow; onChange: (patch: Partial<ContentRow>) => void }) {
  if (row.sourceType === 'path_contains') {
    return (
      <div className="grid gap-2.5">
        <Field label="路径包含" hint="一行一个，填路径里的一段">
          <textarea
            className={TEXTAREA_CLASS}
            placeholder="/your-repo/wiki/"
            value={row.pathContains.join('\n')}
            onChange={(event) => onChange({ pathContains: linesToArray(event.target.value) })}
          />
        </Field>
        {row.kind === 'code' ? <ExcludeGlobsField row={row} onChange={onChange} /> : null}
      </div>
    );
  }

  if (row.sourceType === 'user_root') {
    const rootLabel = row.kind === 'knowledge' ? '知识库目录' : '需求 / 文档目录';
    return (
      <p className="rounded-[4px] border border-[var(--color-border)] bg-[var(--color-base)] px-2.5 py-2 text-[12px] text-[var(--color-secondary)]">
        使用每个用户客户端上报的「{rootLabel}」，这里不用填路径。
      </p>
    );
  }

  if (row.sourceType === 'code_catchall') {
    return (
      <div className="grid gap-2.5">
        <p className="rounded-[4px] border border-[var(--color-border)] bg-[var(--color-base)] px-2.5 py-2 text-[12px] text-[var(--color-secondary)]">
          代码 = 不在知识库 / 需求目录里的所有路径
        </p>
        <ExcludeGlobsField row={row} onChange={onChange} />
      </div>
    );
  }

  if (row.sourceType === 'url' || row.sourceType === 'mcp') {
    return (
      <Field label="网址前缀" hint="一行一个，如 https://host/docs/">
        <textarea
          className={TEXTAREA_CLASS}
          placeholder="https://host/docs/"
          value={row.urlPrefixes.join('\n')}
          onChange={(event) => onChange({ urlPrefixes: linesToArray(event.target.value) })}
        />
      </Field>
    );
  }

  return null;
}

function ExcludeGlobsField({ row, onChange }: { row: ContentRow; onChange: (patch: Partial<ContentRow>) => void }) {
  return (
    <Field label="排除" hint="要排除的路径通配符，一行一个，如 *.md、dist/">
      <textarea
        className={TEXTAREA_CLASS}
        placeholder={'*.md\ndist/**\nnode_modules/**'}
        value={row.excludeGlobs.join('\n')}
        onChange={(event) => onChange({ excludeGlobs: linesToArray(event.target.value) })}
      />
    </Field>
  );
}

function summarizeContentRow(row: ContentRow): string {
  if (!row.present) return '未配置';
  if (row.sourceType === 'user_root') return row.userRootKey ? `用户根: ${row.userRootKey}` : '用户上报根';
  if (row.sourceType === 'code_catchall') return `排除 ${row.excludeGlobs.length} 条`;
  if (row.sourceType === 'url' || row.sourceType === 'mcp') return `${row.urlPrefixes.length} 个前缀`;
  if (row.pathContains.length === 0) return '未填写路径片段';
  return row.pathContains.join(' / ');
}

function sourceTitle(kind: ContentRow['kind']): string {
  if (kind === 'knowledge') return '知识库来源';
  if (kind === 'process_doc') return '过程文档来源';
  return '代码范围';
}
