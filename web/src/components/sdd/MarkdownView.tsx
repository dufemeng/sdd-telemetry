import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';

/**
 * 渲染知识库 markdown。图片渲染为占位文本、链接渲染但不可跳转
 * （服务器上相对路径未必解析得了，避免误导）。
 */
export function MarkdownView({ content }: { content: string }) {
  return (
    <div className="text-[13px] leading-6 text-[var(--color-secondary)]">
      <ReactMarkdown
        rehypePlugins={[rehypeSanitize]}
        components={{
          h1: ({ children }) => <h1 className="mb-2 mt-3 text-[18px] font-semibold text-[#f5f5f5]">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-2 mt-3 text-[16px] font-semibold text-[#f5f5f5]">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-1.5 mt-2.5 text-[14px] font-semibold text-[#f5f5f5]">{children}</h3>,
          p: ({ children }) => <p className="mb-2">{children}</p>,
          ul: ({ children }) => <ul className="mb-2 list-disc pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="mb-2 list-decimal pl-5">{children}</ol>,
          li: ({ children }) => <li className="mb-1">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="mb-2 border-l-2 border-[var(--color-border)] pl-3 text-[var(--color-muted)]">{children}</blockquote>
          ),
          code: ({ children }) => (
            <code className="rounded-[3px] px-1 py-[1px] text-[12px]" style={{ background: 'var(--color-base)', fontFamily: 'var(--font-mono)' }}>{children}</code>
          ),
          pre: ({ children }) => (
            <pre className="mb-2 overflow-auto rounded-[4px] p-3 text-[12px]" style={{ background: 'var(--color-base)', border: '1px solid var(--color-border)', fontFamily: 'var(--font-mono)' }}>{children}</pre>
          ),
          a: ({ children }) => <span className="text-[var(--color-primary)] underline decoration-dotted">{children}</span>,
          img: ({ alt }) => <span className="text-[var(--color-muted)]">[图片：{alt ?? ''}]</span>,
          table: ({ children }) => <table className="mb-2 w-full border-collapse text-[12px]">{children}</table>,
          th: ({ children }) => <th className="border border-[var(--color-border)] px-2 py-1 text-left">{children}</th>,
          td: ({ children }) => <td className="border border-[var(--color-border)] px-2 py-1">{children}</td>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
