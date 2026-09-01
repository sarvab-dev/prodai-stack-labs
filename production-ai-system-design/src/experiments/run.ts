import { performance } from "node:perf_hooks";
import { ModelError, type ModelProvider, type ModelRequest, type ProviderResponse } from "../contracts";
import { FakeProvider } from "../providers/adapter";
import { retry, withDeadline, type RetryPolicy } from "../reliability/retry";
import { routeWithFallback } from "../routing/fallback";
import { validateStructuredOutput } from "../validation/schema";
import { validateBusinessRules } from "../validation/business";

type Metrics = Record<string, number | string | boolean | Record<string, number>>;
type ExperimentResult = { status: "PASSED" | "FAILED"; summary: string; metrics: Metrics; observations: string[] };
const request = (deadlineMs: number): ModelRequest => ({ requestId: "experiment", prompt: "deterministic task", model: "fake-v1", schemaVersion: "1.0", deadlineMs });
const percentile = (values: number[], value: number) => values.slice().sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * value) - 1)] || 0;
const round = (value: number) => Math.round(value * 100) / 100;

async function timeoutExperiment(): Promise<ExperimentResult> {
  const cases = [{ latency: 500, deadline: 1000 }, { latency: 2000, deadline: 2500 }, { latency: 5000, deadline: 5500 }, { latency: 250, deadline: 100 }];
  const latencies: number[] = []; let completed = 0; let timedOut = 0;
  for (const item of cases) {
    const provider = new FakeProvider([{ latencyMs: item.latency }]); const started = performance.now();
    try { await withDeadline((signal) => provider.generate(request(item.deadline), signal), item.deadline); completed += 1; }
    catch (error) { if (error instanceof ModelError && error.code === "TIMEOUT") timedOut += 1; else throw error; }
    latencies.push(performance.now() - started);
  }
  return { status: completed === 3 && timedOut === 1 ? "PASSED" : "FAILED", summary: "Three in-budget requests completed and the over-deadline request was cancelled.", metrics: { cases: cases.length, completionRate: completed / cases.length, timeoutRate: timedOut / cases.length, p95LatencyMs: round(percentile(latencies, .95)) }, observations: ["AbortSignal cancelled the over-deadline provider call.", "Latency values are local wall-clock measurements against deterministic timers."] };
}

async function retryExperiment(): Promise<ExperimentResult> {
  const policy: RetryPolicy = { maxAttempts: 3, baseDelayMs: 20, maxDelayMs: 80, jitterRatio: 0.2 };
  const results: Record<string, { calls: number; success: number; simulatedLatencyMs: number }> = {};
  for (const strategy of ["none", "fixed", "exponential"] as const) {
    let calls = 0; const simulatedLatencyMs = 0; let clock = 0;
    const delays: number[] = [];
    const dependencies = { now: () => clock, random: () => .5, sleep: async (ms: number) => { const delay = strategy === "fixed" ? 20 : ms; delays.push(delay); clock += delay; } };
    try {
      await retry((attempt) => { calls += 1; if (attempt < 3) throw new ModelError(attempt === 1 ? "RATE_LIMIT" : "PROVIDER", "temporary", true); return Promise.resolve("ok"); }, { ...policy, maxAttempts: strategy === "none" ? 1 : 3, jitterRatio: strategy === "fixed" ? 0 : policy.jitterRatio }, 1000, dependencies);
      results[strategy] = { calls, success: 1, simulatedLatencyMs: delays.reduce((sum, value) => sum + value, 0) };
    } catch { results[strategy] = { calls, success: 0, simulatedLatencyMs }; }
  }
  let nonRetryableCalls = 0;
  await retry(() => { nonRetryableCalls += 1; throw new ModelError("AUTH", "permanent", false); }, policy, 1000, { now: () => 0, random: () => .5, sleep: async () => undefined }).catch(() => undefined);
  return { status: results.exponential.success === 1 && nonRetryableCalls === 1 ? "PASSED" : "FAILED", summary: "Bounded retries recovered temporary 429/500 failures and did not retry permanent failures.", metrics: { providerCalls: { none: results.none.calls, fixed: results.fixed.calls, exponential: results.exponential.calls, nonRetryable: nonRetryableCalls }, successfulTasks: { none: results.none.success, fixed: results.fixed.success, exponential: results.exponential.success }, p95SimulatedLatencyMs: results.exponential.simulatedLatencyMs, retryAmplificationFactor: results.exponential.calls }, observations: ["Backoff timing is virtual and deterministic; no provider traffic occurred.", "Amplification is provider calls divided by one logical task."] };
}

async function schemaExperiment(): Promise<ExperimentResult> {
  const samples = ["not-json", JSON.stringify({ answer: "ok" }), JSON.stringify({ answer: "ok", confidence: .9, citations: ["https://example.com"] }), JSON.stringify({ answer: "uncited", confidence: .9, citations: [] }), JSON.stringify({ answer: "weak", confidence: .2, citations: ["https://example.com"] })];
  let parsed = 0; let schemaValid = 0; let businessValid = 0;
  for (const sample of samples) { const schema = validateStructuredOutput(sample); if (schema.parsed) parsed += 1; if (schema.schemaValid) schemaValid += 1; if (schema.value && validateBusinessRules(schema.value, { minimumConfidence: .7, requireCitations: true }).valid) businessValid += 1; }
  return { status: parsed === 4 && schemaValid === 3 && businessValid === 1 ? "PASSED" : "FAILED", summary: "Parsing, structural validity, and domain validity were measured independently.", metrics: { samples: samples.length, parseSuccessRate: parsed / samples.length, schemaValidityRate: schemaValid / samples.length, businessValidityRate: businessValid / samples.length, refusalOrFailureRate: (samples.length - businessValid) / samples.length }, observations: ["Schema-valid output can still fail confidence or citation requirements."] };
}

async function fallbackExperiment(): Promise<ExperimentResult> {
  const scenarios = [{ primary: {}, quality: 1 }, { primary: { status: 429 }, quality: .8 }, { primary: { status: 500 }, quality: .8 }, { primary: { status: 401 }, quality: 0 }];
  let primaryOnlySuccess = 0; let fallbackSuccess = 0; let fallbackUses = 0; let quality = 0; let costUnits = 0;
  const latencies: number[] = [];
  for (const scenario of scenarios) {
    const primaryOnly = new FakeProvider([{ ...scenario.primary, quality: 1, costUnits: 1 }], "primary");
    try { await primaryOnly.generate(request(1000), new AbortController().signal); primaryOnlySuccess += 1; } catch { /* measured failure */ }
    const primary = new FakeProvider([{ ...scenario.primary, quality: 1, costUnits: 1 }], "primary"); const fallback = new FakeProvider([{ quality: scenario.quality, costUnits: 2 }], "fallback"); const started = performance.now();
    try { const routed = await routeWithFallback(request(1000), primary, fallback); fallbackSuccess += 1; fallbackUses += Number(routed.fallbackUsed); const body = JSON.parse(routed.response.text); quality += body.confidence; costUnits += routed.response.usage.estimatedCostUnits || 0; } catch { /* auth must not fallback */ }
    latencies.push(performance.now() - started);
  }
  return { status: primaryOnlySuccess === 1 && fallbackSuccess === 3 && fallbackUses === 2 ? "PASSED" : "FAILED", summary: "Fallback improved completion for retryable failures without masking authentication failures.", metrics: { primaryOnlyCompletionRate: primaryOnlySuccess / scenarios.length, fallbackCompletionRate: fallbackSuccess / scenarios.length, averageDeterministicQuality: round(quality / fallbackSuccess), p95LatencyMs: round(percentile(latencies, .95)), fallbackRate: fallbackUses / scenarios.length, costUnitsPerSuccessfulTask: round(costUnits / fallbackSuccess) }, observations: ["Cost units are synthetic metadata, not currency or provider pricing."] };
}

class CapacityProvider implements ModelProvider {
  readonly name = "capacity-fake"; active = 0; calls = 0; rateLimited = 0;
  constructor(private readonly capacity: number, private readonly latencyMs: number) {}
  async generate(input: ModelRequest, signal: AbortSignal): Promise<ProviderResponse> {
    this.calls += 1; if (this.active >= this.capacity) { this.rateLimited += 1; throw new ModelError("RATE_LIMIT", "capacity", true, 429); }
    this.active += 1; try { return await new FakeProvider([{ latencyMs: this.latencyMs }]).generate(input, signal); } finally { this.active -= 1; }
  }
}

async function loadExperiment(): Promise<ExperimentResult> {
  const provider = new CapacityProvider(8, 20); const total = 80; const latencies: number[] = []; let successes = 0; let errors = 0; const started = performance.now();
  await Promise.all(Array.from({ length: total }, async (_, index) => { const taskStarted = performance.now(); await new Promise((resolve) => setTimeout(resolve, Math.floor(index / 16) * 5)); try { await provider.generate(request(500), new AbortController().signal); successes += 1; } catch { errors += 1; } finally { latencies.push(performance.now() - taskStarted); } }));
  const duration = performance.now() - started;
  return { status: successes > 0 && provider.rateLimited > 0 ? "PASSED" : "FAILED", summary: "A capacity-limited fake provider exposed throughput, tail latency, errors, and rate limiting under bursts.", metrics: { tasks: total, throughputPerSecond: round(successes / (duration / 1000)), p50LatencyMs: round(percentile(latencies, .5)), p95LatencyMs: round(percentile(latencies, .95)), p99LatencyMs: round(percentile(latencies, .99)), errorRate: errors / total, rateLimitRate: provider.rateLimited / provider.calls }, observations: ["Results measure local deterministic fault injection and are not provider benchmarks."] };
}

export async function runExperiments() {
  return { "experiment-timeout": await timeoutExperiment(), "experiment-retry": await retryExperiment(), "experiment-schema": await schemaExperiment(), "experiment-fallback": await fallbackExperiment(), "experiment-load": await loadExperiment() };
}

runExperiments().then((results) => { console.log(JSON.stringify(results, null, 2)); if (Object.values(results).some((result) => result.status !== "PASSED")) process.exitCode = 1; });
