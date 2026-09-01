import type { ModelProvider, ModelRequest, ProviderResponse } from "../contracts";
import { classifyProviderError } from "../reliability/retry";

export type RoutedResponse = { response: ProviderResponse; provider: string; fallbackUsed: boolean; fallbackReason?: string };

export async function routeWithFallback(request: ModelRequest, primary: ModelProvider, fallback: ModelProvider, signal = new AbortController().signal): Promise<RoutedResponse> {
  try { return { response: await primary.generate(request, signal), provider: primary.name, fallbackUsed: false }; }
  catch (error) {
    const classified = classifyProviderError(error);
    if (!classified.retryable) throw classified;
    return { response: await fallback.generate(request, signal), provider: fallback.name, fallbackUsed: true, fallbackReason: classified.code };
  }
}
