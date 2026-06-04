import { createContext, useContext } from 'react';
import type { TimeRange } from './TopBar';

export interface ShellContext {
  timeRange: TimeRange;
  /** 当前观测 profile（全站单 profile 视角，Task 18）。 */
  profileId: string;
}

export const ShellContext = createContext<ShellContext>(null!);

export function useShellContext() {
  return useContext(ShellContext);
}
