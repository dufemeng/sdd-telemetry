---
target: "http://localhost:5173/sdd/skills"
total_score: 21
p0_count: 0
p1_count: 2
timestamp: 2026-06-04T09-19-05Z
slug: web-src-pages-sdd-skills-skillspage-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Loading and retry exist, but the primary status is pipeline pairing rather than business health. |
| 2 | Match System / Real World | 1 | The page speaks in telemetry terms: 有效配对率, triggered, paired, raw skill. |
| 3 | User Control and Freedom | 2 | Search, filter, pagination, and drawer close are present, but there is no path to answer "what should I do next?" |
| 4 | Consistency and Standards | 3 | Visual vocabulary matches the terminal dashboard system. |
| 5 | Error Prevention | 2 | Low destructive risk, but clickable rows and opaque metrics invite misinterpretation. |
| 6 | Recognition Rather Than Recall | 2 | Labels are visible, but metric definitions and decision semantics are missing. |
| 7 | Flexibility and Efficiency | 2 | Power tools are limited to search and unmatched filter; no stage/status/health slices. |
| 8 | Aesthetic and Minimalist Design | 2 | Dense and consistent, but the hierarchy gives equal weight to non-decision data. |
| 9 | Error Recovery | 2 | Section retry exists; auth-blocked state is outside page review and gives no route back to target. |
| 10 | Help and Documentation | 1 | Empty states and metric labels do not teach the boss interpretation. |
| **Total** | | **21/40** | **Coherent shell, wrong product thesis** |

## Anti-Patterns Verdict

**LLM assessment**: This does not visually scream generic AI. The terminal palette, spacing, card radius, and table density are consistent with the project. The failure is subtler and more important: it is an old telemetry dashboard wearing the new shell. The page says "关键技能、调用规模与有效配对链路" and then spends the first screen on skill usage, active users, covered work items, multi-stage work items, call trend, and pairing quality. That is not a boss decision surface.

**Deterministic scan**: The bundled detector returned no findings for `web/src/pages/sdd/skills/SkillsPage.tsx`. This is a useful negative signal: the page is not failing through obvious CSS slop patterns. It is failing through information architecture and product language.

**Visual overlays**: No reliable overlay is available. The local URL redirected to `/login` in the in-app browser, and the session has no dashboard cookie. Chrome-profile automation was not exposed in this session. Browser evidence is therefore limited to confirming the auth redirect and login UI, not the authenticated skills page.

## Overall Impression

The page is visually disciplined but strategically behind the rest of the product. Users, work items, and wiki analysis have moved to "what should a lead decide?" Skills still answers "how many skill events were collected and did our semantic matcher work?" The biggest opportunity is to make the skill tab own method health: SDD stage continuity, live/cold/dead skill assets, next-hop behavior, and per-skill output conversion.

## What's Working

1. The component vocabulary is consistent with the rest of the dashboard: 6px panels, mono numerals, restrained electric yellow, dense tables, and lucide icons.
2. The page has real operational states: query loading, section error retry, empty table text, pagination, and row drawer.
3. The Top 3 skill cards expose scale, users, and covered work items in a scannable format, even though the current labels are not yet decision-grade.

## Priority Issues

### [P1] The page optimizes for telemetry health, not boss decisions

**Why it matters**: The lead opening this tab needs to know whether the team is adopting SDD correctly, where the method breaks, and what to change next. Instead, the headline and first screen emphasize "有效配对", "调用质量", triggered/paired trend, and raw skill matching. Those are pipeline quality checks.

**Fix**: Replace the first-screen thesis with method health: `方法论完整度`, `断崖阶段`, `活技能占比`, `死技能`. Move pairing/matched/unmatched into a debug section inside the skill drawer or an ops-only corner.

**Suggested command**: `$impeccable shape http://localhost:5173/sdd/skills`

### [P1] The skill asset denominator is missing

**Why it matters**: A boss needs to know which seeded skills are dead or underused. The current table is driven by `usage-summary`, so skills with zero usage disappear. That makes the most important management problem invisible.

**Fix**: Add a skills health model using `sdd_skill_semantics` as the denominator. Show live/cold/dead, last seen, usage count, active users, and top next skill. Include zero-use seeded skills in the table.

**Suggested command**: `$impeccable polish http://localhost:5173/sdd/skills`

### [P2] The trend chart answers the wrong question

**Why it matters**: The chart compares triggered vs paired. That explains the telemetry pipeline, not whether the team is moving through proposal, design, task, code landing, and codereview. It burns the largest visual area on a secondary concern.

**Fix**: Either replace the trend with a methodology funnel or split trend by SDD stage. Put the biggest stage dropoff in the section title or caption so the chart has a conclusion.

**Suggested command**: `$impeccable layout http://localhost:5173/sdd/skills`

### [P2] The drawer is a raw-event inspector, not a skill profile

**Why it matters**: Clicking a skill should answer "who uses this, what does it produce, what usually follows, and is it healthy?" The current drawer gives overview counts, semantic/raw names, recent calls, sessionId, promptId, interactionId, and raw JSON. That is useful for debugging but weak for leadership action.

**Fix**: Turn the drawer into a single-skill profile: trend, top users, next-skill distribution, artifact/code conversion, health status, and a collapsed debug block for raw names and matchedBy.

**Suggested command**: `$impeccable harden http://localhost:5173/sdd/skills`

### [P3] Visual accents imply ranking/status too aggressively

**Why it matters**: The 3px side bars on cards/rows and repeated green/red status marks put visual emphasis on matched vs unmatched. That reinforces the old operational story.

**Fix**: Use full-row badges, compact status pills, or stage dots. Reserve the strongest accent for the method-health conclusion and actual risk states.

**Suggested command**: `$impeccable quieter http://localhost:5173/sdd/skills`

## Persona Red Flags

**Tech Lead / Boss**: The first screen does not tell them the next decision. They see call volume and pairing quality, but not "task to code landing is failing" or "three seeded skills are dead." They leave without knowing whether to coach people, update skills, or retire a workflow.

**SDD Workflow Owner**: They cannot see whether the method is healthy as a system. Missing seeded zero-use skills and missing next-hop distribution mean they cannot distinguish a dead skill from a healthy niche skill.

**Power User Engineer**: They can inspect recent invocations, but the drawer forces them into IDs and raw JSON. It does not help them learn what a good usage chain looks like or compare their skill path to a team benchmark.

## Minor Observations

- The subtitle still says "有效配对链路", which anchors the whole page to implementation quality.
- The "全链路需求" KPI is underspecified: `>=3 个 SDD 阶段` is a threshold, not a business conclusion.
- `调用占比` in Top 3 is correctly labeled, but it is not a conversion or value metric.
- Search has no explicit accessible label in the local component, only placeholder text.
- The page likely inherits the project-wide `body { min-width: 1180px }`, so mobile responsiveness is intentionally out of scope but should be called out in any audit.

## Questions to Consider

1. Do you want this tab to be a method-health cockpit or a skill catalog first?
2. Should "dead skills" be treated as a risk KPI, or should they live only in the table filter?
3. Should code landing sit before codereview in the funnel, or should codereview remain a parallel quality lane?
