# SDD Telemetry

SDD Telemetry observes AI-assisted engineering workflows by linking workflow configuration, knowledge use, process documents, and implementation signals into profile-specific projections.

## Language

**Profile**:
A configured workflow boundary for observing one team, business line, or delivery model. A Profile decides which sources and activities belong to that workflow.

**Content Source**:
A declared source category that a Profile can observe, such as knowledge or process documents.
_Avoid_: Data source, storage

**Knowledge Source**:
The documentation or knowledge base that agents read to understand business and engineering context.
_Avoid_: Wiki path, docs folder

**Knowledge Access Fact**:
A profile-scoped fact that an agent attempted to read, grep, or glob a resource from a Knowledge Source. It keeps the source namespace, relative locator, interaction, tool call, outcome evidence, and event time without materializing repository-specific directory levels.
_Avoid_: Wiki recall row, axis record

**Path Dimension**:
Any directory segment derived at query time from a Knowledge Access Fact's relative locator. Path Dimensions are overlapping labels, not a partition of total accesses, so their counts must not be stacked or summed as the access total.
_Avoid_: Axis, fixed domain/system level

**Process Document Source**:
The documents that represent demand, proposal, design, task, review, or other workflow artifacts.
_Avoid_: Requirements repo, artifact folder

**Observable Code Source**:
A code source explicitly declared by a Profile as relevant implementation scope. It is not the user's entire local repository set.
_Avoid_: Code range, all code repositories
