// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SDD_DEFAULT_PROFILE_ID,
  getProfileConfig,
  validateProfileConfig,
  type WorkflowProfileConfig,
} from '@sdd-telemetry/api';
import { decodeSemanticRows } from './config-authoring';
import { SkillMappingSection } from './SkillMappingSection';

const sdd = getProfileConfig(SDD_DEFAULT_PROFILE_ID)!;

afterEach(() => cleanup());

describe('SkillMappingSection', () => {
  it('adds a skill only after the editor save action', () => {
    const onChange = vi.fn();

    render(<Harness initialConfig={sdd} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /新增技能/ }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getAllByText('新增技能').length).toBeGreaterThan(0);
    expect(screen.getAllByDisplayValue('semantic-14')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: '保存技能' }));

    const nextConfig = onChange.mock.calls.at(-1)?.[0] as WorkflowProfileConfig;
    expect(validateProfileConfig(nextConfig).valid).toBe(true);
    expect(decodeSemanticRows(nextConfig).at(-1)).toMatchObject({
      code: 'semantic-14',
      displayName: '新能力',
      aliases: ['semantic-14'],
    });
  });
});

function Harness({
  initialConfig,
  onChange,
}: {
  initialConfig: WorkflowProfileConfig;
  onChange: (next: WorkflowProfileConfig) => void;
}) {
  const [config, setConfig] = useState(initialConfig);

  return (
    <SkillMappingSection
      config={config}
      onChange={(next) => {
        onChange(next);
        setConfig(next);
      }}
    />
  );
}
