export type FinishReason = "stop" | "refusal" | "length";

export type ModelUsage = { inputTokens: number; outputTokens: number; estimatedCostUnits?: number };
export type ModelRequest = { requestId: string; prompt: string; model: string; schemaVersion: string; deadlineMs: number };
export type ProviderResponse = { text: string; model: string; finishReason: FinishReason; usage: ModelUsage };

export type AppResult<T> =
  | { kind: "success"; value: T; usage: ModelUsage }
  | { kind: "refusal"; reason: string; usage: ModelUsage }
  | { kind: "degraded"; value: T; reason: string; usage: ModelUsage }
  | { kind: "error"; code: ModelErrorCode; retryable: boolean; message: string };

export type ModelErrorCode = "TIMEOUT" | "RATE_LIMIT" | "PROVIDER" | "AUTH" | "INVALID_OUTPUT" | "ABORTED";

export class ModelError extends Error {
  constructor(public readonly code: ModelErrorCode, message: string, public readonly retryable: boolean, public readonly status?: number) { super(message); }
}

export interface ModelProvider {
  readonly name: string;
  generate(request: ModelRequest, signal: AbortSignal): Promise<ProviderResponse>;
}
