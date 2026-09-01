import type { AppResult, ModelProvider, ModelRequest, ProviderResponse } from "./contracts";
import { classifyProviderError, retry, withDeadline, type RetryPolicy } from "./reliability/retry";
import type { TraceRecorder } from "./observability/tracing";

export class ModelGateway {
  constructor(private readonly provider: ModelProvider, private readonly retryPolicy: RetryPolicy, private readonly traces?: TraceRecorder) {}
  async generate<T>(request: ModelRequest, parse: (response: ProviderResponse) => T): Promise<AppResult<T>> {
    const started = Date.now();
    try {
      const response = await retry(() => withDeadline((signal) => this.provider.generate(request, signal), Math.max(1, request.deadlineMs - (Date.now() - started))), this.retryPolicy, started + request.deadlineMs);
      this.traces?.record(request, response, Date.now() - started);
      if (response.finishReason === "refusal") return { kind: "refusal", reason: response.text, usage: response.usage };
      return { kind: "success", value: parse(response), usage: response.usage };
    } catch (error) {
      const classified = classifyProviderError(error);
      return { kind: "error", code: classified.code, retryable: classified.retryable, message: classified.message };
    }
  }
}
