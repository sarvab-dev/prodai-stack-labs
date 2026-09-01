import { ModelError, type ModelProvider, type ModelRequest, type ProviderResponse } from "../contracts";

export type ProviderSdk = { complete(input: { prompt: string; model: string; signal: AbortSignal }): Promise<{ output: string; model: string; inputTokens: number; outputTokens: number; finishReason?: string }> };

export class ProviderAdapter implements ModelProvider {
  readonly name = "sdk-adapter";
  constructor(private readonly sdk: ProviderSdk) {}
  async generate(request: ModelRequest, signal: AbortSignal): Promise<ProviderResponse> {
    try {
      const response = await this.sdk.complete({ prompt: request.prompt, model: request.model, signal });
      return { text: response.output, model: response.model, finishReason: response.finishReason === "refusal" ? "refusal" : "stop", usage: { inputTokens: response.inputTokens, outputTokens: response.outputTokens } };
    } catch (error) {
      const status = typeof error === "object" && error && "status" in error ? Number(error.status) : undefined;
      if (status === 401 || status === 403) throw new ModelError("AUTH", "Provider authentication failed.", false, status);
      if (status === 429) throw new ModelError("RATE_LIMIT", "Provider rate limit reached.", true, status);
      if (status && status >= 500) throw new ModelError("PROVIDER", "Provider temporarily unavailable.", true, status);
      throw error;
    }
  }
}

export type FakeStep = { latencyMs?: number; text?: string; status?: number; finishReason?: "stop" | "refusal"; quality?: number; costUnits?: number };

export class FakeProvider implements ModelProvider {
  readonly name: string; calls = 0;
  constructor(private readonly steps: FakeStep[], name = "fake") { this.name = name; }
  async generate(request: ModelRequest, signal: AbortSignal): Promise<ProviderResponse> {
    const step = this.steps[Math.min(this.calls, this.steps.length - 1)] || {}; this.calls += 1;
    if (step.latencyMs) await new Promise<void>((resolve, reject) => { const timer = setTimeout(resolve, step.latencyMs); signal.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason); }, { once: true }); });
    if (step.status === 429) throw new ModelError("RATE_LIMIT", "Rate limited.", true, 429);
    if (step.status && step.status >= 500) throw new ModelError("PROVIDER", "Provider failure.", true, step.status);
    if (step.status) throw new ModelError("AUTH", "Non-retryable provider failure.", false, step.status);
    return { text: step.text || JSON.stringify({ answer: "ok", confidence: step.quality ?? 1 }), model: request.model, finishReason: step.finishReason || "stop", usage: { inputTokens: 10, outputTokens: 5, estimatedCostUnits: step.costUnits ?? 1 } };
  }
}
