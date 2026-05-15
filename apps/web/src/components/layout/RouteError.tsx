import { AlertTriangle } from 'lucide-react';
import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router-dom';

export function RouteError() {
  const error = useRouteError();
  const navigate = useNavigate();

  const is404 = isRouteErrorResponse(error) && error.status === 404;
  const title = is404 ? '页面不存在' : '加载出错';
  const message = is404
    ? '你访问的路径没有对应的页面'
    : error instanceof Error
      ? error.message
      : isRouteErrorResponse(error)
        ? `${error.status} ${error.statusText}`
        : '未知错误';

  return (
    <div className="grid min-h-[60vh] place-items-center p-4">
      <div
        className="grid gap-3 max-w-[480px] p-6 rounded-[6px] text-center"
        style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
      >
        <AlertTriangle size={28} className="mx-auto text-[var(--color-bad-text)]" />
        <h2 className="text-[16px] font-semibold text-[#f5f5f5]">{title}</h2>
        <p
          className="text-[12px] text-[var(--color-muted)] break-words"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {message}
        </p>
        <button
          onClick={() => navigate('/')}
          className="mt-2 mx-auto min-h-[32px] px-4 rounded-[4px] font-semibold text-[12px] text-[var(--color-base)] bg-[var(--color-primary)] border-0 cursor-pointer"
        >
          回到总览
        </button>
      </div>
    </div>
  );
}
