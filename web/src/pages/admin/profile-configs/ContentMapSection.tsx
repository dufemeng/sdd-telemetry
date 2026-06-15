import type { WorkflowProfileConfig } from '@sdd-telemetry/api';
import {
  CONTENT_KIND_META,
  CONTENT_SOURCE_TYPE_LABEL,
  type ContentRow,
  type ContentSourceType,
  decodeContentRows,
  encodeContentRows,
} from './config-authoring';
import { Field, INPUT_CLASS, Section, TEXTAREA_CLASS, Warn, linesToArray } from './config-ui';

const PATH_SOURCE_TYPES: ContentSourceType[] = ['path_contains', 'user_root', 'code_catchall'];

export function ContentMapSection({
  config,
  onChange,
}: {
  config: WorkflowProfileConfig;
  onChange: (next: WorkflowProfileConfig) => void;
}) {
  const rows = decodeContentRows(config);

  function updateRow(kind: ContentRow['kind'], patch: Partial<ContentRow>) {
    const next = rows.map((row) => (row.kind === kind ? { ...row, ...patch } : row));
    onChange(encodeContentRows(config, next));
  }

  return (
    <Section title="内容地图" hint="这个 profile 怎么识别你的研发活动 · 改这里就够了">
      <div className="grid gap-3">
        {rows.map((row) => (
          <ContentRowEditor key={row.kind} row={row} onChange={(patch) => updateRow(row.kind, patch)} />
        ))}
      </div>
    </Section>
  );
}

function ContentRowEditor({ row, onChange }: { row: ContentRow; onChange: (patch: Partial<ContentRow>) => void }) {
  const meta = CONTENT_KIND_META[row.kind];
  const isPath = PATH_SOURCE_TYPES.includes(row.sourceType);

  return (
    <div className="grid gap-2.5 rounded-[6px] border border-[var(--color-border)] bg-[#141414] p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[15px]" aria-hidden>
            {meta.icon}
          </span>
          <div>
            <div className="text-[12px] font-semibold text-[#f5f5f5]">{meta.label}</div>
            <div className="text-[11px] text-[var(--color-muted)]">{meta.hint}</div>
          </div>
        </div>
        {isPath ? (
          <select
            className={`${INPUT_CLASS} w-auto`}
            value={row.sourceType}
            onChange={(event) => onChange({ sourceType: event.target.value as ContentSourceType })}
          >
            {PATH_SOURCE_TYPES.map((type) => (
              <option key={type} value={type}>
                {CONTENT_SOURCE_TYPE_LABEL[type]}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-[11px] text-[var(--color-secondary)]">{CONTENT_SOURCE_TYPE_LABEL[row.sourceType]}</span>
        )}
      </div>

      {!row.present ? (
        <Warn>当前配置没有「{meta.label}」这一类来源。到高级视图新增,或换个 profile。</Warn>
      ) : (
        <ContentRowInput row={row} onChange={onChange} />
      )}
    </div>
  );
}

function ContentRowInput({ row, onChange }: { row: ContentRow; onChange: (patch: Partial<ContentRow>) => void }) {
  if (row.sourceType === 'path_contains') {
    return (
      <div className="grid gap-2.5">
        <Field label="路径包含" hint="命中含这些子串的路径,一行一个">
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
    return (
      <div className="grid gap-2.5">
        <Field label="按用户根" hint="root 取自每个用户上报的目录,无需填绝对路径">
          <select
            className={`${INPUT_CLASS} w-auto`}
            value={row.userRootKey ?? 'wiki'}
            onChange={(event) => onChange({ userRootKey: event.target.value as 'wiki' | 'requirements' })}
          >
            <option value="wiki">wiki 根(知识库)</option>
            <option value="requirements">requirements 根(需求/过程文档)</option>
          </select>
        </Field>
      </div>
    );
  }

  if (row.sourceType === 'code_catchall') {
    return (
      <div className="grid gap-2.5">
        <p className="text-[11px] text-[var(--color-secondary)]">
          代码 = 除知识库 / 过程文档根之外的所有路径
          {row.excludeUserRootKeys.length ? `(排除根:${row.excludeUserRootKeys.join('、')})` : ''}
        </p>
        <ExcludeGlobsField row={row} onChange={onChange} />
      </div>
    );
  }

  if (row.sourceType === 'url' || row.sourceType === 'mcp') {
    return (
      <Field label="URL 前缀" hint="命中以这些前缀开头的网址,一行一个">
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
    <Field label="排除" hint="不算代码的相对路径 glob,一行一个">
      <textarea
        className={TEXTAREA_CLASS}
        placeholder={'*.md\ndist/**\nnode_modules/**'}
        value={row.excludeGlobs.join('\n')}
        onChange={(event) => onChange({ excludeGlobs: linesToArray(event.target.value) })}
      />
    </Field>
  );
}
