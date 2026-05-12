# Product Thesis

## One-Line Thesis

Architect Companion turns architectural taste into an opinionated, reusable harness for AI coding agents.

## Context

AI coding agents are becoming increasingly capable. Tools such as Claude Code, Codex, Cursor, and Copilot are likely to absorb many standalone features in code generation, code review, security analysis, performance analysis, and refactoring.

Competing directly with those tools is risky. They are broad platforms with strong distribution and fast iteration cycles.

The more durable opportunity is to help teams use those tools well.

## Product Idea

Build an opinionated harness that configures existing agentic development tools according to a clear architectural point of view.

The harness should provide a strong default starting point for teams that want to adopt agentic engineering without inventing their own operating model from scratch.

The value is not "our AI is better." The value is:

> This is how we believe serious teams should use AI coding agents.

## What The Harness Should Package

The harness should package opinionated defaults across several layers:

- agent instruction files such as `AGENTS.md`, `CLAUDE.md`, Cursor rules, and Copilot instructions
- reusable workflows for planning, implementation, review, refactoring, ADRs, and dependency changes
- architecture metadata for boundaries, components, ownership, risks, and exceptions
- executable fitness functions that check whether changes respect the intended architecture
- CI integration for pull request review and enforcement
- adapter layers for MCP, hooks, skills, slash commands, and plugins

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

The strongest version is a combination of public defaults, executable checks, and an adaptable consulting-ready operating model.

## Why This Can Survive Platform Improvements

General-purpose coding agents need to remain broadly useful. They cannot encode every consultancy's preferred way of working, every team's architecture doctrine, or every organization's governance model as their default behavior.

This project can survive by living above the tools:

- Claude Code, Codex, Cursor, and Copilot are execution engines.
- This harness is the architectural operating model.
- MCP, hooks, plugins, skills, and instruction files are integration surfaces.

If the underlying agents improve, the harness becomes more valuable because better agents can follow better guidance.

## Open-Source Assumptions

Assume this repository may be public.

That means the project should contain:

- public-safe product thinking
- generic examples
- reusable templates
- fictional sample systems
- clear design rationale

It should not contain:

- confidential client material
- private consulting playbooks copied verbatim
- proprietary architecture diagrams
- non-public company names or system details

The public version can demonstrate taste without leaking client-specific knowledge.

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

## Business Model Hypothesis

The open-source project can create trust and distribution.

Commercial value can come from:

- consulting-led adoption
- custom policy packs
- organization-specific architecture profiles
- training and enablement
- enterprise rollout support
- hosted reporting and drift dashboards
- exception and governance workflows

The product and consulting business reinforce each other: the product makes the consulting approach repeatable, and real consulting experience improves the product's defaults.

## Current Design Principle

Do not build another AI coding tool.

Build the harness that tells AI coding tools how to behave.

