export type EvaluationMetrics = { quality: number; reliability: number; p95LatencyMs: number; safety: number; costUnitsPerSuccess: number };
export type GateThresholds = { minimumQuality: number; minimumReliability: number; maximumP95LatencyMs: number; minimumSafety: number; maximumCostUnitsPerSuccess: number };

export function evaluateReleaseGate(metrics: EvaluationMetrics, thresholds: GateThresholds) {
  const failures: string[] = [];
  if (metrics.quality < thresholds.minimumQuality) failures.push("quality");
  if (metrics.reliability < thresholds.minimumReliability) failures.push("reliability");
  if (metrics.p95LatencyMs > thresholds.maximumP95LatencyMs) failures.push("latency");
  if (metrics.safety < thresholds.minimumSafety) failures.push("safety");
  if (metrics.costUnitsPerSuccess > thresholds.maximumCostUnitsPerSuccess) failures.push("cost");
  return { passed: failures.length === 0, failures };
}
