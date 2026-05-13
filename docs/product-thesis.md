# Product Thesis

## One-Line Thesis

Architect Companion turns architectural knowledge into an opinionated, reusable harness for AI-assisted software engineering.

## Product Idea

Build an opinionated harness that configures existing agentic development tools according to a clear architectural point of view.

The harness should provide a strong default starting point for teams that want to adopt agentic engineering without inventing their own operating model from scratch.

## What The Harness Should Package

The harness should package opinionated defaults across several layers:

- agent instruction files such as `AGENTS.md`, `CLAUDE.md`, Cursor rules, and Copilot instructions
- reusable workflows for planning, implementation, review, refactoring, ADRs, and dependency changes
- architecture metadata for boundaries, components, ownership, risks, and exceptions
- executable fitness functions that check whether changes respect the intended architecture
- CI integration for pull request review and enforcement
- adapter layers for MCP, hooks, skills, slash commands, and plugins

The canonical source of truth should be a tool-independent harness model, not an agent-specific configuration file. See [Harness Model](harness-model.md) for the current source/target design.

Architectural knowledge should be encoded in reusable profiles, policies, workflows, review heuristics, examples, and target renderers. See [Architecture Knowledge](architecture-knowledge.md) for the current model.

Rendering should be deterministic, and code checks should prefer orchestration of existing analysis tools over reimplementation. See [Rendering And Checks](rendering-and-checks.md).

## Positioning

The project should be positioned as:

> An opinionated architecture harness for agentic engineering.

or:

> A starting point for teams who want AI coding agents to follow architectural discipline.

Avoid positioning it as:

- an AI coding agent
- an AI architecture reviewer
- a security scanner
- a performance analyzer
- a generic prompt pack

The strongest version is a combination of public defaults, executable checks, and an adaptable operating model.

## Open-Source Assumptions

Assume this repository may be public.

That means the project should contain:

- public-safe product thinking
- generic examples
- reusable templates
- fictional sample systems
- clear design rationale

It should not contain:

- confidential third-party material
- private internal playbooks copied verbatim
- proprietary architecture diagrams
- non-public company names or system details

## Possible MVP

An initial MVP could provide:

- `arch-harness init`
- `arch-harness check`
- `arch-harness review`
- generated `AGENTS.md`, `CLAUDE.md`, Cursor rules, and Copilot instructions
- a small architecture metadata model
- a few useful policy checks, such as forbidden dependencies or module boundary violations
- a GitHub Actions workflow
- one or two complete example repositories

The first useful demo should show an agent being guided by the harness before and during a change, then the same harness checking the result in CI.

## Current Design Principle

Do not build another AI coding tool.

Build the harness that tells AI coding tools how to behave.
