# Production AI System Design

A standalone, vendor-neutral TypeScript reference implementation for production AI application boundaries and reliability controls.

## Architecture

The request path is contract-first: a model gateway applies deadlines and retry policy, routes requests through provider adapters and fallback providers, validates structured and business output, records OpenTelemetry-compatible semantic attributes, and returns an explicit success, refusal, or error result. Idempotency protects side effects, while evaluation thresholds provide a release gate.

## Directory structure

- `src/contracts.ts` — request, response, usage, provider, and error contracts
- `src/model-gateway.ts` — deadline-aware gateway orchestration
- `src/providers/` — provider adapter and deterministic fake provider
- `src/validation/` — schema and business validation
- `src/reliability/` — timeout, error classification, retry, backoff, and jitter
- `src/routing/` — fallback routing
- `src/actions/` — idempotent side-effect handling
- `src/observability/` — OpenTelemetry-compatible tracing attributes and span sink
- `src/eval/` — evaluation release gate
- `src/experiments/` — deterministic experiments
- `tests/` — unit and integration-style verification
- `diagrams/` — Mermaid architecture sources
- `scripts/` — Mermaid verification and brief tooling
- `results/` — checked-in deterministic experiment results and reference brief

## Prerequisites

- Node.js 22
- npm 10 or later

## Installation

```bash
npm install
```

No API key, external model provider, or service account is required.

## Run examples and experiments

Run the deterministic production AI experiments:

```bash
npm run example:production-ai
```

Verify all Mermaid sources:

```bash
npm run example:diagrams
```

The experiment results use deterministic mocks and fault injection. They are not external-provider benchmarks and should not be presented as measurements of any hosted model or API.

## Run validation

```bash
npm run typecheck
npm run lint
npm run test
```

## Companion article

[Read the ProdAI Stack article](https://example.invalid/articles/production-ai-system-design) *(placeholder link)*
