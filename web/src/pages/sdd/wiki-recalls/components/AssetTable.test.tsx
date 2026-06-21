// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  ProfileKnowledgePathDimensionSummary,
  ProfileKnowledgeSourceSummary,
} from '@sdd-telemetry/api';
import { AssetTable } from './AssetTable';

afterEach(() => cleanup());

const sources: ProfileKnowledgeSourceSummary[] = [
  {
    sourceNamespace: 'trade',
    label: '交易',
    accessedDocs: 3,
    accessCount: 12,
    distinctUsers: 2,
  },
];

const pathDimensions: ProfileKnowledgePathDimensionSummary[] = [
  {
    sourceNamespace: 'trade',
    pathSegment: 'innerFlow',
    accessedDocs: 3,
    accessCount: 12,
    distinctUsers: 2,
    lastAccessAt: '2026-06-15T10:00:00.000Z',
  },
];

describe('AssetTable', () => {
  it('keeps path-dimension drilldown clickable', () => {
    const onSelectPathDimension = vi.fn();

    render(
      <AssetTable
        pathDimensions={pathDimensions}
        sources={sources}
        onSelectPathDimension={onSelectPathDimension}
      />,
    );

    expect(screen.getByText('访问文档')).toBeTruthy();
    expect(screen.queryByText('覆盖（已读/库内）')).toBeNull();

    fireEvent.click(screen.getByText('innerFlow'));

    expect(onSelectPathDimension).toHaveBeenCalledWith('trade', 'innerFlow');
  });

  it('filters path dimensions without relying on a fixed axis field', () => {
    const onSelectPathDimension = vi.fn();

    render(
      <AssetTable
        pathDimensions={pathDimensions}
        sources={sources}
        onSelectPathDimension={onSelectPathDimension}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('搜索路径维度'), {
      target: { value: 'inner' },
    });

    expect(screen.getByText('innerFlow')).toBeTruthy();
  });
});
