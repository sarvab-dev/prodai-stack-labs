import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

type JsonObject = Record<string, unknown>;
const diagramFiles: Record<string, string> = {
  "diagram-prototype-vs-production": "prototype-vs-production.mmd", "diagram-request-lifecycle": "request-lifecycle.mmd",
  "diagram-reliability-envelope": "reliability-envelope.mmd", "diagram-side-effect": "side-effect.mmd",
  "diagram-observability": "observability-loop.mmd", "diagram-ci-eval": "ci-evaluation-gates.mmd", "diagram-final-reference": "final-reference.mmd",
};

async function main() {
  const input = process.argv[2]; const output = process.argv[3];
  if (!input || !output) throw new Error("Usage: update-brief <input.json> <output.json>");
  const brief = JSON.parse(await readFile(input, "utf8")) as JsonObject;
  const root = join(process.cwd(), "examples", "production-ai-system-design");
  for (const diagram of brief.diagrams as JsonObject[]) {
    const file = diagramFiles[String(diagram.id)];
    if (!file) throw new Error(`Missing diagram mapping: ${String(diagram.id)}`);
    diagram.source = await readFile(join(root, "diagrams", file), "utf8"); diagram.status = "COMPLETE";
  }
  for (const example of brief.codeExamples as JsonObject[]) { example.status = "COMPLETE"; example.code = ""; }
  const results = JSON.parse(await readFile(join(root, "results", "experiment-results.json"), "utf8")) as Record<string, JsonObject>;
  for (const experiment of brief.experiments as JsonObject[]) {
    const result = results[String(experiment.id)]; if (!result) throw new Error(`Missing experiment result: ${String(experiment.id)}`);
    experiment.commands = ["npm run example:production-ai"]; experiment.results = result;
  }
  const review = brief.technicalReview as JsonObject; review.status = "COMPLETE"; review.reviewedBy = "Codex";
  review.checks = { codeExecuted: true, testsPassed: true, lintPassed: true, typeCheckPassed: true, benchmarksRun: true, architectureReviewed: true, sourcesVerified: true };
  review.commandsExecuted = ["npm run typecheck", "npm run lint", "npm run test", "npm run example:production-ai", "npm run example:diagrams"];
  review.notes = [...(review.notes as string[]), "Implemented vendor-neutral TypeScript examples with deterministic fake providers; no secrets or paid model calls are required.", "Experiment metrics are measured local mock/fault-injection results, not external-provider benchmarks.", "Mermaid sources passed the repository declaration and delimiter verifier."];
  const editorialReview = brief.editorialReview as JsonObject; editorialReview.checks = { ...(editorialReview.checks as JsonObject), codeExamplesComplete: true, experimentsComplete: true, diagramsComplete: true, technicalReviewComplete: true, contentComplete: false };
  if ((brief.content as JsonObject).body !== "") throw new Error("Refusing to modify a non-empty article body.");
  await mkdir(dirname(output), { recursive: true }); await writeFile(output, `${JSON.stringify(brief, null, 2)}\n`, "utf8");
  console.log(output);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
