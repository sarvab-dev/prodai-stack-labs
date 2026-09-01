import { z } from "zod";
import { ModelError, type ProviderResponse } from "../contracts";

export const AnswerSchema = z.object({ answer: z.string().trim().min(1).max(2000), confidence: z.number().min(0).max(1), citations: z.array(z.url()).max(10).default([]) });
export type Answer = z.infer<typeof AnswerSchema>;

export type ValidationStage = { parsed: boolean; schemaValid: boolean; value?: Answer; error?: string };

export function validateStructuredOutput(text: string): ValidationStage {
  let value: unknown;
  try { value = JSON.parse(text); } catch { return { parsed: false, schemaValid: false, error: "Response was not JSON." }; }
  const result = AnswerSchema.safeParse(value);
  return result.success ? { parsed: true, schemaValid: true, value: result.data } : { parsed: true, schemaValid: false, error: result.error.issues[0]?.message || "Schema validation failed." };
}

export function parseProviderAnswer(response: ProviderResponse) {
  const result = validateStructuredOutput(response.text);
  if (!result.value) throw new ModelError("INVALID_OUTPUT", result.error || "Invalid output.", false);
  return result.value;
}
