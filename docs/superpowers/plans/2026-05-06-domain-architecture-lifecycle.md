# Domain Architecture Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the project lifecycle contract so DDD domain architecture review happens before plan grilling.

**Architecture:** This is a documentation-only workflow contract change. The project-local agent contract points to the new lifecycle order, while domain documentation defines what the new `domain-architecture` pass reads, produces, and refuses to do.

**Tech Stack:** Markdown, AGENTS.md, project docs.

---

## File Structure

- Modify: `AGENTS.md`
  Update the lifecycle order and Plan Grilling instructions to include `domain-architecture`.
- Modify: `docs/agents/domain.md`
  Define the DDD pass inputs, outputs, ADR boundaries, and constraints for `improve-codebase-architecture`.
- Create: `docs/superpowers/specs/2026-05-06-domain-architecture-lifecycle-design.md`
  Preserve the approved design input.
- Create: `docs/superpowers/plans/2026-05-06-domain-architecture-lifecycle.md`
  Preserve this implementation plan.

---

### Task 1: Preserve Approved Design Input

**Files:**
- Create: `docs/superpowers/specs/2026-05-06-domain-architecture-lifecycle-design.md`

- [x] **Step 1: Save the design spec**

Write the approved design with goal, scope, domain-architecture pass contract,
bounded `improve-codebase-architecture` use, non-goals, review notes, and
revised lifecycle path.

- [x] **Step 2: Self-review the spec**

Check that the spec does not include FE/React/Vercel or BE/FastAPI skill
refactoring, external installers, hook execution, package manager execution, or
cross-project rollout.

### Task 2: Update Project Agent Contract

**Files:**
- Modify: `AGENTS.md`

- [x] **Step 1: Update Plan Grilling rules**

Add `domain-architecture` between `superpowers:brainstorming` and `grill-me`, and
state that `writing-spec` is the brainstorming design spec output rather than a
separate gate.

- [x] **Step 2: Update Lifecycle Control Plane order**

Replace the previous standard path with:

```text
intake -> office-hours optional -> superpowers:brainstorming / writing-spec -> domain-architecture -> grill-me -> plan-design-review -> superpowers:writing-plans -> plan-eng-review -> implement -> code-review -> release -> operate
```

### Task 3: Update Domain Documentation

**Files:**
- Modify: `docs/agents/domain.md`

- [x] **Step 1: Add the domain architecture pass**

Document the sources the pass reads and the architecture implications it must
emit before grilling.

- [x] **Step 2: Bound architecture refactoring**

Document that `improve-codebase-architecture` only applies to architecture
candidates accepted in the plan and cannot become an open-ended cleanup phase.

### Task 4: Verify Documentation Change

**Files:**
- Verify: `AGENTS.md`
- Verify: `docs/agents/domain.md`
- Verify: `docs/superpowers/specs/2026-05-06-domain-architecture-lifecycle-design.md`
- Verify: `docs/superpowers/plans/2026-05-06-domain-architecture-lifecycle.md`

- [x] **Step 1: Check git diff**

Run:

```bash
git diff -- AGENTS.md docs/agents/domain.md docs/superpowers/specs/2026-05-06-domain-architecture-lifecycle-design.md docs/superpowers/plans/2026-05-06-domain-architecture-lifecycle.md
```

Expected: only lifecycle/domain architecture workflow documentation changed.

- [x] **Step 2: Check markdown surface**

Run:

```bash
git diff --check
```

Expected: no whitespace errors.

## Self-Review

- Spec coverage: every requested scope and non-goal appears in either
  `AGENTS.md` or `docs/agents/domain.md`.
- Placeholder scan: no placeholder markers are present.
- Boundary check: no external installer, hook, package manager, plugin, or
  cross-project rollout action is introduced.
