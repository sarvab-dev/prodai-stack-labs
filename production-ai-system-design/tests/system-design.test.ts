import { describe, expect, it, vi } from "vitest";
import { ModelError, type ModelRequest } from "../src/contracts";
import { IdempotentAction } from "../src/actions/idempotent";
import { evaluateReleaseGate } from "../src/eval/release-gate";
import { ModelGateway } from "../src/model-gateway";
import { MemorySpanSink, TraceRecorder } from "../src/observability/tracing";
import { FakeProvider, ProviderAdapter } from "../src/providers/adapter";
import { backoffDelay, classifyProviderError, retry, withDeadline } from "../src/reliability/retry";
import { routeWithFallback } from "../src/routing/fallback";
import { validateBusinessRules } from "../src/validation/business";
import { parseProviderAnswer, validateStructuredOutput } from "../src/validation/schema";

const request: ModelRequest = { requestId: "test-1", prompt: "test", model: "fake-v1", schemaVersion: "1.0", deadlineMs: 100 };
const signal = () => new AbortController().signal;

describe("production AI reference implementation", () => {
  it("classifies retryable and permanent provider errors", async () => {
    const rateLimited = new ProviderAdapter({ complete: vi.fn().mockRejectedValue({ status: 429 }) });
    const unauthorized = new ProviderAdapter({ complete: vi.fn().mockRejectedValue({ status: 401 }) });
    await expect(rateLimited.generate(request, signal())).rejects.toMatchObject({ code: "RATE_LIMIT", retryable: true });
    await expect(unauthorized.generate(request, signal())).rejects.toMatchObject({ code: "AUTH", retryable: false });
    expect(classifyProviderError(new Error("timeout waiting for provider"))).toMatchObject({ code: "TIMEOUT", retryable: true });
  });

  it("enforces deadlines and classifies timeout", async () => {
    await expect(withDeadline((abortSignal) => new FakeProvider([{ latencyMs: 30 }]).generate(request, abortSignal), 5)).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("honors retry limits and does not retry permanent errors", async () => {
    let retryableCalls = 0; let permanentCalls = 0;
    const dependencies = { now: () => 0, random: () => .5, sleep: async () => undefined };
    await expect(retry(() => { retryableCalls += 1; throw new ModelError("PROVIDER", "temporary", true); }, { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 4, jitterRatio: 0 }, 100, dependencies)).rejects.toMatchObject({ code: "PROVIDER" });
    await expect(retry(() => { permanentCalls += 1; throw new ModelError("AUTH", "permanent", false); }, { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 4, jitterRatio: 0 }, 100, dependencies)).rejects.toMatchObject({ code: "AUTH" });
    expect({ retryableCalls, permanentCalls }).toEqual({ retryableCalls: 3, permanentCalls: 1 });
  });

  it("calculates bounded exponential backoff with deterministic jitter", () => {
    const policy = { maxAttempts: 5, baseDelayMs: 100, maxDelayMs: 250, jitterRatio: .2 };
    expect([1, 2, 3, 4].map((attempt) => backoffDelay(attempt, policy, () => .5))).toEqual([100, 200, 250, 250]);
  });

  it("separates JSON, schema, and business validation", () => {
    expect(validateStructuredOutput("bad")).toMatchObject({ parsed: false, schemaValid: false });
    expect(validateStructuredOutput(JSON.stringify({ answer: "ok" }))).toMatchObject({ parsed: true, schemaValid: false });
    const valid = validateStructuredOutput(JSON.stringify({ answer: "ok", confidence: .4, citations: [] }));
    expect(valid.schemaValid).toBe(true);
    expect(validateBusinessRules(valid.value!, { minimumConfidence: .8, requireCitations: true })).toMatchObject({ valid: false, issues: expect.arrayContaining([expect.stringContaining("Confidence"), expect.stringContaining("citation")]) });
  });

  it("deduplicates concurrent side effects and enforces approval", async () => {
    const execute = vi.fn(async (value: number) => value * 2); const action = new IdempotentAction<number, number>(() => true, execute);
    await expect(action.run({ idempotencyKey: "x", actorId: "a", approved: false, payload: 2 })).rejects.toThrow("approval");
    const [first, duplicate] = await Promise.all([action.run({ idempotencyKey: "same", actorId: "a", approved: true, payload: 2 }), action.run({ idempotencyKey: "same", actorId: "a", approved: true, payload: 2 })]);
    expect(first.value).toBe(4); expect(duplicate).toMatchObject({ duplicate: true, value: 4 }); expect(execute).toHaveBeenCalledOnce();
  });

  it("falls back only for retryable primary failures", async () => {
    const fallback = new FakeProvider([{ text: JSON.stringify({ answer: "fallback", confidence: .8 }) }], "fallback");
    await expect(routeWithFallback(request, new FakeProvider([{ status: 500 }], "primary"), fallback)).resolves.toMatchObject({ provider: "fallback", fallbackUsed: true, fallbackReason: "PROVIDER" });
    await expect(routeWithFallback(request, new FakeProvider([{ status: 401 }], "primary"), fallback)).rejects.toMatchObject({ code: "AUTH" });
  });

  it("records version, model, usage, and latency trace metadata without prompt content", async () => {
    const sink = new MemorySpanSink(); const traces = new TraceRecorder(sink, "app-1", "prompt-2");
    const gateway = new ModelGateway(new FakeProvider([{ text: JSON.stringify({ answer: "ok", confidence: 1 }) }]), { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1, jitterRatio: 0 }, traces);
    await expect(gateway.generate(request, parseProviderAnswer)).resolves.toMatchObject({ kind: "success" });
    expect(sink.spans[0].attributes).toMatchObject({ "app.version": "app-1", "gen_ai.prompt.version": "prompt-2", "gen_ai.request.model": "fake-v1", "gen_ai.usage.input_tokens": 10 });
    expect(sink.spans[0].attributes).not.toHaveProperty("prompt");
  });

  it("blocks a release when any evaluation threshold regresses", () => {
    const thresholds = { minimumQuality: .8, minimumReliability: .99, maximumP95LatencyMs: 1000, minimumSafety: 1, maximumCostUnitsPerSuccess: 2 };
    expect(evaluateReleaseGate({ quality: .9, reliability: 1, p95LatencyMs: 500, safety: 1, costUnitsPerSuccess: 1 }, thresholds)).toEqual({ passed: true, failures: [] });
    expect(evaluateReleaseGate({ quality: .7, reliability: 1, p95LatencyMs: 1200, safety: 1, costUnitsPerSuccess: 1 }, thresholds)).toEqual({ passed: false, failures: ["quality", "latency"] });
  });
});
