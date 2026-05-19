import { createContext, useContext } from 'react';
import type { TimeRange } from './TopBar';

export interface ShellContext {
  timeRange: TimeRange;
  search: string;
}

export const ShellContext = createContext<ShellContext>(null!);

export function useShellContext() {
  return useContext(ShellContext);
}
