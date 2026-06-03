import { useState, type RefObject } from 'react';
import { toPng } from 'html-to-image';
import { useAuth } from '@/components/auth/useAuth';

interface Props {
  reportDate: string;
  docRef: RefObject<HTMLDivElement | null>;
  onRegenerate: () => void;
  regenerating: boolean;
}

function collectAllCSS(): string {
  let css = '';
  for (const sheet of document.styleSheets) {
    try {
      const rules = sheet.cssRules;
      for (const rule of rules) {
        css += rule.cssText + '\n';
      }
    } catch {
      // cross-origin stylesheet, skip
    }
  }
  return css;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function DailyReportToolbar({ reportDate, docRef, onRegenerate, regenerating }: Props) {
  const { user } = useAuth();
  const [exportingHTML, setExportingHTML] = useState(false);
  const [exportingImage, setExportingImage] = useState(false);

  const handleExportHTML = () => {
    const el = docRef.current;
    if (!el) return;
    setExportingHTML(true);
    try {
      const clone = el.cloneNode(true) as HTMLElement;
      const css = collectAllCSS();
      const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SDD 每日简报 - ${reportDate}</title>
<style>
${css}
/* ---- export overrides ---- */
html, body {
  overflow: auto !important;
  min-width: 0 !important;
  height: auto !important;
}
</style>
</head>
<body style="margin:0;background:#1a1a14;min-height:100vh;display:flex;justify-content:center;padding:28px 0;">
${clone.outerHTML}
</body>
</html>`;
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      downloadBlob(blob, `sdd-daily-report-${reportDate}.html`);
    } finally {
      setExportingHTML(false);
    }
  };

  const handleExportImage = async () => {
    const el = docRef.current;
    if (!el) return;
    setExportingImage(true);

    const hadMotionEnter = el.classList.contains('motion-enter');
    if (hadMotionEnter) el.classList.remove('motion-enter');
    const originalOverflow = el.style.overflow;
    el.style.overflow = 'visible';

    await new Promise<void>((r) => requestAnimationFrame(() => r()));

    try {
      const width = el.offsetWidth;
      const height = el.scrollHeight;

      const dataUrl = await toPng(el, {
        pixelRatio: 2,
        backgroundColor: '#fffdf8',
        width,
        height,
        style: {
          overflow: 'visible',
          transform: 'none',
        },
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `sdd-daily-report-${reportDate}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error('导出图片失败:', err);
    } finally {
      el.style.overflow = originalOverflow;
      if (hadMotionEnter) el.classList.add('motion-enter');
      setExportingImage(false);
    }
  };

  return (
    <div className="daily-report-tools">
      <button type="button" onClick={handleExportHTML} disabled={exportingHTML} title="导出 HTML">
        {exportingHTML ? '导出中...' : '导出 HTML'}
      </button>
      <button type="button" onClick={handleExportImage} disabled={exportingImage} title="导出图片">
        {exportingImage ? '导出中...' : '导出图片'}
      </button>
      {user.role === 'super_admin' && (
        <button
          type="button"
          onClick={onRegenerate}
          disabled={regenerating}
          title="重新生成此日日报"
        >
          {regenerating ? '生成中...' : '重新生成'}
        </button>
      )}
    </div>
  );
}
