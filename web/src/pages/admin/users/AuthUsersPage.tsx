import { useEffect, useState } from 'react';
import { ShieldCheck, UserPlus } from 'lucide-react';
import type { AuthRole, AuthUser } from '@sdd-telemetry/api';
import { DataTable } from '@/components/ui/DataTable';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import {
  useAuthUsers,
  useCreateAuthUser,
  useResetAuthPassword,
  useSetAuthUserStatus,
  useUpdateAuthUser,
} from './useAuthUsers';

const INPUT_CLASS =
  'w-full min-h-8 px-[10px] rounded-[4px] text-[12px] text-[var(--color-text)] outline-none bg-[var(--color-base)] border border-[var(--color-border)] focus:border-[rgba(250,255,105,0.55)] transition-colors';

export default function AuthUsersPage() {
  const usersQuery = useAuthUsers();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const users = usersQuery.data ?? [];
  const selected = users.find(user => user.id === selectedId) ?? null;

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: 'minmax(0,1.45fr) minmax(340px,0.8fr)' }}>
      <Panel title="登录成员" icon={<ShieldCheck size={18} />}>
        <DataTable
          headers={['用户名', '显示名', '角色', '状态', '最近登录']}
          rows={users.map(user => ({
            key: user.id,
            cells: [
              user.username,
              user.displayName,
              roleText(user.role),
              <StatusBadge
                key={user.id}
                status={user.status === 'active' ? '已启用' : '已禁用'}
                variant={user.status === 'active' ? 'good' : 'bad'}
              />,
              formatTime(user.lastLoginAt),
            ],
          }))}
          selectedRowKey={selectedId}
          onRowSelect={rowKey => setSelectedId(String(rowKey))}
          emptyText={usersQuery.isPending ? '加载中…' : '暂无登录成员'}
        />
        {usersQuery.error ? (
          <p className="mt-3 text-[12px] text-[var(--color-bad-text)]">{usersQuery.error.message}</p>
        ) : null}
      </Panel>
      <MemberEditor selected={selected} onCreate={() => setSelectedId(null)} />
    </div>
  );
}

function MemberEditor({ selected, onCreate }: { selected: AuthUser | null; onCreate: () => void }) {
  const createMutation = useCreateAuthUser();
  const updateMutation = useUpdateAuthUser();
  const passwordMutation = useResetAuthPassword();
  const statusMutation = useSetAuthUserStatus();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<AuthRole>('viewer');
  const [password, setPassword] = useState('');

  useEffect(() => {
    setUsername(selected?.username ?? '');
    setDisplayName(selected?.displayName ?? '');
    setRole(selected?.role ?? 'viewer');
    setPassword('');
    createMutation.reset();
    updateMutation.reset();
    passwordMutation.reset();
    statusMutation.reset();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const isPending =
    createMutation.isPending ||
    updateMutation.isPending ||
    passwordMutation.isPending ||
    statusMutation.isPending;
  const error =
    createMutation.error ??
    updateMutation.error ??
    passwordMutation.error ??
    statusMutation.error;

  function submitProfile(event: React.FormEvent) {
    event.preventDefault();
    if (selected) {
      updateMutation.mutate({ id: selected.id, body: { displayName, role } });
      return;
    }
    createMutation.mutate(
      { username, displayName, password, role },
      {
        onSuccess: () => {
          setUsername('');
          setDisplayName('');
          setRole('viewer');
          setPassword('');
          onCreate();
        },
      },
    );
  }

  function resetPassword() {
    if (selected && password) {
      passwordMutation.mutate(
        { id: selected.id, body: { password } },
        { onSuccess: () => setPassword('') },
      );
    }
  }

  return (
    <Panel
      title={selected ? '编辑成员' : '新增成员'}
      icon={<UserPlus size={18} />}
      headerRight={
        selected ? (
          <button
            type="button"
            className="text-[12px] text-[var(--color-secondary)] hover:text-[var(--color-primary)]"
            onClick={onCreate}
          >
            新增
          </button>
        ) : undefined
      }
    >
      <form className="grid gap-3" onSubmit={submitProfile}>
        <FormField label="用户名">
          <input
            className={selected ? `${INPUT_CLASS} opacity-50` : INPUT_CLASS}
            disabled={Boolean(selected)}
            required
            value={username}
            onChange={event => setUsername(event.target.value)}
          />
        </FormField>
        <FormField label="显示名">
          <input
            className={INPUT_CLASS}
            required
            value={displayName}
            onChange={event => setDisplayName(event.target.value)}
          />
        </FormField>
        <FormField label="角色">
          <select
            className={INPUT_CLASS}
            value={role}
            onChange={event => setRole(event.target.value as AuthRole)}
          >
            <option value="viewer">普通成员（只读）</option>
            <option value="super_admin">超级管理员</option>
          </select>
        </FormField>
        {!selected ? (
          <FormField label="初始密码">
            <input
              className={INPUT_CLASS}
              minLength={12}
              required
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
            />
          </FormField>
        ) : null}
        <button
          className="min-h-[34px] rounded-[4px] border-0 bg-[var(--color-primary)] text-[var(--color-base)] font-bold disabled:opacity-60"
          disabled={isPending}
          type="submit"
        >
          {selected ? '保存资料' : '创建成员'}
        </button>
      </form>

      {selected ? (
        <div className="mt-5 grid gap-3 border-t border-[var(--color-border)] pt-4">
          <FormField label="重置密码">
            <input
              className={INPUT_CLASS}
              minLength={12}
              placeholder="新密码，至少 12 位"
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
            />
          </FormField>
          <button
            className="min-h-[34px] rounded-[4px] border border-[var(--color-border)] bg-transparent text-[var(--color-secondary)] disabled:opacity-60"
            disabled={isPending || password.length < 12}
            onClick={resetPassword}
            type="button"
          >
            重置成员密码
          </button>
          <button
            className={[
              'min-h-[34px] rounded-[4px] border bg-transparent disabled:opacity-60',
              selected.status === 'active'
                ? 'border-[var(--color-bad-text)] text-[var(--color-bad-text)]'
                : 'border-[var(--color-good-text)] text-[var(--color-good-text)]',
            ].join(' ')}
            disabled={isPending}
            onClick={() =>
              statusMutation.mutate({
                id: selected.id,
                action: selected.status === 'active' ? 'disable' : 'enable',
              })
            }
            type="button"
          >
            {selected.status === 'active' ? '禁用成员' : '启用成员'}
          </button>
        </div>
      ) : null}

      {error ? <p className="mt-3 text-[12px] text-[var(--color-bad-text)]">{error.message}</p> : null}
    </Panel>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-[12px] text-[var(--color-secondary)]">
      {label}
      {children}
    </label>
  );
}

function roleText(role: AuthRole): string {
  return role === 'super_admin' ? '超级管理员' : '普通成员';
}

function formatTime(value: string | null): string {
  return value ? new Date(value).toLocaleString('zh-CN') : '从未登录';
}
