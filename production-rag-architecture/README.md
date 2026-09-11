# Production RAG Architecture

A standalone, vendor-neutral TypeScript reference implementation for versioned ingestion, hybrid retrieval, authorization, citations, evaluation, and release gates.

## Architecture

The knowledge plane creates deterministic, provenance-rich chunks and durable tombstones. The answer plane filters by authorization before BM25-style keyword and deterministic vector retrieval, fuses ranks with RRF, optionally reranks, builds bounded context, and validates evidence-bound citations.

## Project structure

- `src/ingestion/` — versioning, chunking, provenance, updates, and deletes
- `src/retrieval/` — authorization, keyword, vector, RRF, hybrid, and reranking
- `src/context/`, `src/citations/`, `src/pipeline/` — grounded-answer path
- `src/eval/`, `src/experiments/` — metrics, experiments, and release gate
- `fixtures/`, `tests/`, `diagrams/` — deterministic corpus and verification

## Run

Requires Node.js 22 and npm 10 or later. No API key, network service, model, or vector database is required.

```bash
npm install
npm run typecheck
npm run lint
npm run test
npm run example:rag
npm run example:experiments
npm run example:diagrams
```

The experiment harness measures Recall@k, MRR, nDCG, citation precision/coverage, authorization leakage, context trade-offs, and freshness/delete correctness. Whitespace-delimited context units are estimates, not provider billing tokens.

## Limitations

The deterministic hash vectorizer and reranker demonstrate replaceable architectural boundaries; they are not substitutes for production embedding or cross-encoder models. The small fixture corpus is designed for transparent regression tests, not broad relevance benchmarking.

The included results come from a deterministic local test harness and are not benchmarks of OpenAI, Anthropic, Google, AWS, Azure, Elastic, or any external model/search provider.
