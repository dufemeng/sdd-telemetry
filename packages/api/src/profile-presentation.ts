import type {
  ProfilePresentation,
  ProfilePresentationLabels,
  ProfilePresentationStages,
  ProfilePresentationWidgets,
  ProfileStageDescriptor,
} from './contracts/profile.contract';

export interface NormalizedProfilePresentation extends ProfilePresentation {
  labels: ProfilePresentationLabels;
  stages: ProfilePresentationStages;
  widgets: ProfilePresentationWidgets;
  legacyOnlySurfaces: string[];
}

const SDD_LABELS: ProfilePresentationLabels = {
  dashboardTitle: 'SDD 质量观测台',
  deliveryUnitSingular: '需求',
  deliveryUnitPlural: '需求',
  artifactSingular: '文档',
  artifactPlural: '文档',
  capabilitySingular: '技能',
  capabilityPlural: '技能',
  knowledgeSingular: '知识库',
  knowledgePlural: '知识库',
};

const SOURCE_BACKED_LABELS: ProfilePresentationLabels = {
  dashboardTitle: '研发工作流观测台',
  deliveryUnitSingular: '交付单元',
  deliveryUnitPlural: '交付单元',
  artifactSingular: '产物',
  artifactPlural: '产物',
  capabilitySingular: '能力',
  capabilityPlural: '能力',
  knowledgeSingular: '知识',
  knowledgePlural: '知识',
};

const STAGE_LABELS: Record<string, string> = {
  proposal: '需求',
  design: '设计',
  task: '任务',
  review: '评审',
  codereview: '代码评审',
  plan: '计划',
  process_doc: '过程文档',
  requirement: '需求文档',
};

export function normalizeProfilePresentation(
  presentation: ProfilePresentation | undefined,
): NormalizedProfilePresentation {
  const base = presentation ?? {
    workflowKind: 'sdd' as const,
    maturityStages: ['proposal', 'design', 'task', 'codereview'],
    artifactStageOrder: ['proposal', 'design', 'task', 'review'],
    hiddenMetrics: [],
    knowledgeCoverageMode: 'filesystem_scan' as const,
  };

  return {
    ...base,
    labels: base.labels ?? defaultLabels(base.workflowKind),
    stages: base.stages ?? {
      artifactStages: deriveStageDescriptors(base.artifactStageOrder),
      maturityStages: deriveStageDescriptors(base.maturityStages),
    },
    widgets: base.widgets ?? deriveWidgetsFromHiddenMetrics(
      base.hiddenMetrics,
      base.knowledgeCoverageMode,
      base.workflowKind,
    ),
    legacyOnlySurfaces: base.legacyOnlySurfaces ?? defaultLegacyOnlySurfaces(base.workflowKind),
  };
}

export function deriveStageDescriptors(stageCodes: string[]): ProfileStageDescriptor[] {
  return stageCodes.map((code, index) => ({
    code,
    label: STAGE_LABELS[code] ?? code,
    order: index,
  }));
}

export function deriveWidgetsFromHiddenMetrics(
  hiddenMetrics: string[],
  knowledgeCoverageMode: ProfilePresentation['knowledgeCoverageMode'],
  workflowKind: ProfilePresentation['workflowKind'],
): ProfilePresentationWidgets {
  const hidden = new Set(hiddenMetrics);
  return {
    artifactCoverageFunnel: hidden.has('sddStageDots')
      ? (workflowKind === 'sdd' ? 'none' : 'artifact_type')
      : 'sdd_stage',
    userMaturity: hidden.has('maturity') ? 'none' : 'sdd_maturity',
    knowledgeCoverage: knowledgeCoverageMode,
    callQuality: !hidden.has('callQuality'),
    matchHealth: !hidden.has('matchHealth'),
    triggerSourceBreakdown: !hidden.has('userTriggeredCount') && !hidden.has('autoTriggeredCount'),
    multiStageDeliveryUnit: !hidden.has('multiStageDeliveryUnitCount'),
  };
}

function defaultLabels(workflowKind: ProfilePresentation['workflowKind']): ProfilePresentationLabels {
  return workflowKind === 'sdd' ? SDD_LABELS : SOURCE_BACKED_LABELS;
}

function defaultLegacyOnlySurfaces(workflowKind: ProfilePresentation['workflowKind']): string[] {
  if (workflowKind === 'sdd') return [];
  return ['semantics', 'dailyReport'];
}
