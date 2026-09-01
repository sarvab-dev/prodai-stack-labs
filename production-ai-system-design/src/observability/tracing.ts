import type { ModelRequest, ProviderResponse } from "../contracts";

export type TraceAttributes = Record<string, string | number | boolean>;
export interface SpanSink { add(name: string, attributes: TraceAttributes): void }

export class TraceRecorder {
  constructor(private readonly sink: SpanSink, private readonly applicationVersion: string, private readonly promptVersion: string) {}
  record(request: ModelRequest, response: ProviderResponse, latencyMs: number) {
    this.sink.add("gen_ai.request", {
      "app.version": this.applicationVersion, "gen_ai.prompt.version": this.promptVersion, "gen_ai.schema.version": request.schemaVersion,
      "gen_ai.request.id": request.requestId, "gen_ai.request.model": request.model, "gen_ai.response.model": response.model,
      "gen_ai.usage.input_tokens": response.usage.inputTokens, "gen_ai.usage.output_tokens": response.usage.outputTokens,
      "gen_ai.response.finish_reason": response.finishReason, "server.duration_ms": latencyMs,
    });
  }
}

export class MemorySpanSink implements SpanSink { readonly spans: { name: string; attributes: TraceAttributes }[] = []; add(name: string, attributes: TraceAttributes) { this.spans.push({ name, attributes }); } }
