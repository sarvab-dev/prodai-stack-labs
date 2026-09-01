import type { Answer } from "./schema";

export type BusinessContext = { minimumConfidence: number; requireCitations: boolean; forbiddenClaims?: string[] };
export type BusinessValidation = { valid: boolean; issues: string[] };

export function validateBusinessRules(answer: Answer, context: BusinessContext): BusinessValidation {
  const issues: string[] = [];
  if (answer.confidence < context.minimumConfidence) issues.push("Confidence is below the product threshold.");
  if (context.requireCitations && answer.citations.length === 0) issues.push("At least one citation is required.");
  if (context.forbiddenClaims?.some((claim) => answer.answer.toLowerCase().includes(claim.toLowerCase()))) issues.push("Answer contains a prohibited unverified claim.");
  return { valid: issues.length === 0, issues };
}
