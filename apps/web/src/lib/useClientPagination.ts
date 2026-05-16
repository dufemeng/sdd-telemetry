import { useState } from 'react';

export function useClientPagination<T>(items: T[], pageSize: number) {
  const [page, setPage] = useState(0);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageItems = items.slice(safePage * pageSize, (safePage + 1) * pageSize);
  const hasNext = safePage < totalPages - 1;
  const hasPrev = safePage > 0;

  const goNext = () => setPage((p) => p + 1);
  const goPrev = () => setPage((p) => Math.max(0, p - 1));
  const reset = () => setPage(0);

  return { pageItems, pageNumber: safePage + 1, hasNext, hasPrev, goNext, goPrev, reset };
}
