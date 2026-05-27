import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRound, LogOut, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { AuthSessionUser, ChangePasswordRequest } from '@sdd-telemetry/api';
import { requestData } from '@/api/client';
import { AUTH_ME_QUERY_KEY } from '@/components/auth/AuthGate';
import { useAuth } from '@/components/auth/useAuth';

const INPUT_CLASS =
  'min-h-8 w-full rounded-[4px] border border-[var(--color-border)] bg-[var(--color-base)] px-2 text-[12px] text-[var(--color-text)] outline-none focus:border-[rgba(250,255,105,0.55)]';

export function AccountMenu() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editingPassword, setEditingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const logoutMutation = useMutation({
    mutationFn: () => requestData<{ loggedOut: boolean }>('/api/auth/logout', { method: 'POST' }),
    onSettled: () => {
      queryClient.removeQueries({ queryKey: AUTH_ME_QUERY_KEY });
      navigate('/login', { replace: true });
    },
  });
  const passwordMutation = useMutation({
    mutationFn: (body: ChangePasswordRequest) =>
      requestData<AuthSessionUser>('/api/auth/password', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: updatedUser => {
      queryClient.setQueryData(AUTH_ME_QUERY_KEY, updatedUser);
      setCurrentPassword('');
      setNewPassword('');
      setEditingPassword(false);
    },
  });

  function submitPassword(event: React.FormEvent) {
    event.preventDefault();
    passwordMutation.mutate({ currentPassword, newPassword });
  }

  return (
    <div className="relative flex items-center gap-2">
      <div className="flex items-center gap-2 px-2 text-[12px] text-[var(--color-secondary)]">
        <UserRound size={15} />
        <span>{user.displayName}</span>
      </div>
      <button
        type="button"
        onClick={() => setEditingPassword(value => !value)}
        className="grid h-8 w-8 place-items-center rounded-[4px] border border-[var(--color-border)] bg-[#171717] text-[var(--color-secondary)] hover:text-[var(--color-primary)]"
        title="修改密码"
      >
        <KeyRound size={15} />
      </button>
      <button
        type="button"
        disabled={logoutMutation.isPending}
        onClick={() => logoutMutation.mutate()}
        className="grid h-8 w-8 place-items-center rounded-[4px] border border-[var(--color-border)] bg-[#171717] text-[var(--color-secondary)] hover:text-[var(--color-primary)] disabled:opacity-50"
        title="退出登录"
      >
        <LogOut size={15} />
      </button>

      {editingPassword ? (
        <form
          className="absolute right-0 top-10 z-20 grid w-[270px] gap-3 rounded-[6px] p-3"
          style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
          onSubmit={submitPassword}
        >
          <p className="text-[13px] font-semibold text-[#f5f5f5]">修改密码</p>
          <input
            aria-label="当前密码"
            autoComplete="current-password"
            className={INPUT_CLASS}
            placeholder="当前密码"
            type="password"
            value={currentPassword}
            onChange={event => setCurrentPassword(event.target.value)}
            required
          />
          <input
            aria-label="新密码"
            autoComplete="new-password"
            className={INPUT_CLASS}
            minLength={12}
            placeholder="新密码，至少 12 位"
            type="password"
            value={newPassword}
            onChange={event => setNewPassword(event.target.value)}
            required
          />
          <button
            className="min-h-8 rounded-[4px] border-0 bg-[var(--color-primary)] text-[12px] font-bold text-[var(--color-base)] disabled:opacity-60"
            disabled={passwordMutation.isPending}
            type="submit"
          >
            {passwordMutation.isPending ? '保存中…' : '保存新密码'}
          </button>
          {passwordMutation.error ? (
            <p className="text-[12px] text-[var(--color-bad-text)]">{passwordMutation.error.message}</p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
