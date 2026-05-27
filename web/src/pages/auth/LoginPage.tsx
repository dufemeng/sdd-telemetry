import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LogIn, Table2 } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { AuthLoginRequest, AuthSessionUser } from '@sdd-telemetry/api';
import { requestData } from '@/api/client';
import { AUTH_ME_QUERY_KEY } from '@/components/auth/AuthGate';

const INPUT_CLASS =
  'w-full min-h-10 px-3 rounded-[4px] text-[13px] text-[var(--color-text)] outline-none bg-[var(--color-base)] border border-[var(--color-border)] focus:border-[rgba(250,255,105,0.55)] transition-colors';

export default function LoginPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const mutation = useMutation({
    mutationFn: (body: AuthLoginRequest) =>
      requestData<AuthSessionUser>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: user => {
      queryClient.setQueryData(AUTH_ME_QUERY_KEY, user);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from?.startsWith('/') ? from : '/', { replace: true });
    },
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    mutation.mutate({ username, password });
  }

  return (
    <main className="grid h-screen place-items-center bg-[var(--color-base)]">
      <section
        className="grid w-[380px] gap-5 rounded-[6px] p-7"
        style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
      >
        <div className="grid justify-items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-[6px] bg-[var(--color-primary)] text-[var(--color-base)]">
            <Table2 size={25} />
          </div>
          <div className="text-center">
            <h1 className="text-[19px] font-bold text-[#f5f5f5]">SDD 质量观测台</h1>
            <p className="mt-1 text-[12px] text-[var(--color-muted)]">请登录后查看观测数据</p>
          </div>
        </div>

        <form className="grid gap-4" onSubmit={handleSubmit}>
          <label className="grid gap-1.5 text-[12px] text-[var(--color-secondary)]">
            用户名
            <input
              autoComplete="username"
              autoFocus
              className={INPUT_CLASS}
              value={username}
              onChange={event => setUsername(event.target.value)}
              required
            />
          </label>
          <label className="grid gap-1.5 text-[12px] text-[var(--color-secondary)]">
            密码
            <input
              autoComplete="current-password"
              className={INPUT_CLASS}
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              required
            />
          </label>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="mt-1 flex min-h-10 items-center justify-center gap-2 rounded-[4px] border-0 bg-[var(--color-primary)] text-[13px] font-bold text-[var(--color-base)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <LogIn size={16} />
            {mutation.isPending ? '登录中…' : '登录'}
          </button>
          {mutation.error ? (
            <p className="text-center text-[12px] text-[var(--color-bad-text)]">
              {mutation.error.message}
            </p>
          ) : null}
        </form>
      </section>
    </main>
  );
}
