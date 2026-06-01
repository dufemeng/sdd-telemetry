import { useState } from 'react';
import { useAuth } from '@/components/auth/useAuth';

interface Props {
  reportDate: string;
  markdownText: string;
  onRegenerate: () => void;
  regenerating: boolean;
}

export function DailyReportToolbar({ reportDate, markdownText, onRegenerate, regenerating }: Props) {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);

  const handleCopyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(markdownText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = markdownText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="daily-report-tools">
      <button type="button" onClick={handleCopyMarkdown} title="复制 Markdown">
        {copied ? '已复制' : '复制 Markdown'}
      </button>
      <button type="button" onClick={handlePrint} title="打印 PDF">
        打印 PDF
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
