import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  pageNumber: number;
  pageSize: number;
  hasNext: boolean;
  hasPrev: boolean;
  onNext: () => void;
  onPrev: () => void;
}

const BTN_CLS =
  'flex items-center gap-1 min-h-8 px-3 rounded-[4px] text-[12px] cursor-pointer text-[var(--color-secondary)] disabled:opacity-50 disabled:cursor-not-allowed hover:text-[var(--color-primary)] hover:bg-[#202016]';

export function Pagination({ pageNumber, pageSize, hasNext, hasPrev, onNext, onPrev }: PaginationProps) {
  if (!hasNext && !hasPrev) return null;

  return (
    <div className="flex items-center justify-between pt-1">
      <span className="text-[11px] text-[var(--color-muted)]">
        第 {pageNumber} 页 · 每页 {pageSize} 行
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPrev}
          disabled={!hasPrev}
          className={BTN_CLS}
          style={{ border: '1px solid var(--color-border)', background: 'transparent' }}
        >
          <ChevronLeft size={14} />
          上一页
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!hasNext}
          className={BTN_CLS}
          style={{ border: '1px solid var(--color-border)', background: 'transparent' }}
        >
          下一页
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
