import { useNavigate, useLocation } from 'react-router-dom';

/**
 * 详情页「返回」按钮：优先回退到上一页（从哪来回哪去，如 用户页 → 详情 → 用户页）；
 * 当没有应用内历史（直接打开 / 刷新进入）或来源不在本站时，fallback 到所属列表页，
 * 避免回退跳出应用。
 *
 * 不要用在「正向跳转」按钮上——那些该直接 navigate 到目标。
 */
export function useBackNavigate(fallback: string) {
  const navigate = useNavigate();
  const location = useLocation();
  return () => {
    const hasAppHistory = location.key !== 'default';
    const sameOriginReferrer =
      typeof document !== 'undefined' &&
      document.referrer !== '' &&
      new URL(document.referrer).origin === window.location.origin;
    if (hasAppHistory || sameOriginReferrer) navigate(-1);
    else navigate(fallback);
  };
}

