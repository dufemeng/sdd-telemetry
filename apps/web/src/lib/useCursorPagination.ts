import { useState } from 'react';

export function useCursorPagination() {
  const [cursorStack, setCursorStack] = useState<string[]>([]);

  const currentCursor = cursorStack[cursorStack.length - 1];
  const pageNumber = cursorStack.length + 1;
  const hasPrev = cursorStack.length > 0;

  const goNext = (nextCursor: string) => setCursorStack((prev) => [...prev, nextCursor]);
  const goPrev = () => setCursorStack((prev) => prev.slice(0, -1));
  const reset = () => setCursorStack([]);

  return { currentCursor, pageNumber, hasPrev, goNext, goPrev, reset };
}
