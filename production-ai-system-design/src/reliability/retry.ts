import { ModelError } from "../contracts";

export type RetryPolicy = { maxAttempts: number; baseDelayMs: number; maxDelayMs: number; jitterRatio: number };
export type RetryDependencies = { now: () => number; sleep: (ms: number) => Promise<void>; random: () => number };

const defaults: RetryDependencies = { now: Date.now, sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)), random: Math.random };

export function classifyProviderError(error: unknown): ModelError {
  if (error instanceof ModelError) return error;
  if (error instanceof DOMException && error.name === "AbortError") return new ModelError("ABORTED", "Request aborted.", false);
  if (error instanceof Error && /timeout/i.test(error.message)) return new ModelError("TIMEOUT", error.message, true);
  return new ModelError("PROVIDER", "Provider request failed.", true);
}

export function backoffDelay(attempt: number, policy: RetryPolicy, random = Math.random) {
  const base = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** Math.max(0, attempt - 1));
  return Math.round(base * (1 - policy.jitterRatio + random() * policy.jitterRatio * 2));
}

export async function withDeadline<T>(operation: (signal: AbortSignal) => Promise<T>, deadlineMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("Deadline exceeded.", "TimeoutError")), deadlineMs);
  try { return await operation(controller.signal); }
  catch (error) { if (controller.signal.aborted) throw new ModelError("TIMEOUT", "Request deadline exceeded.", true); throw error; }
  finally { clearTimeout(timer); }
}

export async function retry<T>(operation: (attempt: number) => Promise<T>, policy: RetryPolicy, deadlineAt: number, dependencies: RetryDependencies = defaults) {
  let lastError: ModelError | undefined;
  for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
    try { return await operation(attempt); }
    catch (error) {
      lastError = classifyProviderError(error);
      if (!lastError.retryable || attempt === policy.maxAttempts) throw lastError;
      const delay = backoffDelay(attempt, policy, dependencies.random);
      if (dependencies.now() + delay >= deadlineAt) throw new ModelError("TIMEOUT", "Retry would exceed request deadline.", false);
      await dependencies.sleep(delay);
    }
  }
  throw lastError || new ModelError("PROVIDER", "Retry failed.", false);
}
