import { useOutletContext } from 'react-router-dom';
import type { TimeRange } from './TopBar';

export interface ShellContext {
  timeRange: TimeRange;
  search: string;
}

export function useShellContext() {
  return useOutletContext<ShellContext>();
}
