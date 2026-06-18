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

**Process Document Source**:
The documents that represent demand, proposal, design, task, review, or other workflow artifacts.
_Avoid_: Requirements repo, artifact folder

**Observable Code Source**:
A code source explicitly declared by a Profile as relevant implementation scope. It is not the user's entire local repository set.
_Avoid_: Code range, all code repositories
