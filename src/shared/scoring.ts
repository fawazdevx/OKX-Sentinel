import type { FindingSeverity, RiskFinding, RiskLevel } from "./types";

const severityWeights: Record<FindingSeverity, number> = {
  info: 0,
  low: 8,
  medium: 18,
  high: 30,
  critical: 42
};

export function findingToScore(findings: RiskFinding[], baseScore = 8): number {
  const weightedScore = findings.reduce((score, finding) => score + severityWeights[finding.severity], baseScore);
  const severityPressure = Math.max(
    0,
    ...findings.map((finding) => {
      if (finding.severity === "critical") return 82;
      if (finding.severity === "high") return 62;
      if (finding.severity === "medium") return 38;
      if (finding.severity === "low") return 18;
      return 0;
    })
  );

  return clampScore(Math.max(weightedScore, severityPressure));
}

export function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function riskLevelFromScore(score: number): RiskLevel {
  if (score >= 85) return "Critical";
  if (score >= 65) return "High";
  if (score >= 35) return "Medium";
  return "Low";
}

export function summarizeRisk(score: number, target: string, strongestFinding?: RiskFinding): string {
  const level = riskLevelFromScore(score).toLowerCase();
  const reason = strongestFinding ? ` Main driver: ${strongestFinding.title.toLowerCase()}.` : "";

  return `${target} is currently assessed as ${level} risk with a score of ${score}/100.${reason}`;
}

export function strongestFinding(findings: RiskFinding[]): RiskFinding | undefined {
  const severityRank: Record<FindingSeverity, number> = {
    info: 0,
    low: 1,
    medium: 2,
    high: 3,
    critical: 4
  };

  return [...findings].sort((a, b) => severityRank[b.severity] - severityRank[a.severity])[0];
}

export function confidenceFromSources(sourceCount: number, usedLiveReads: boolean, heuristicOnlyPenalty = 0.16): number {
  const base = usedLiveReads ? 0.78 : 0.62;
  const sourceBoost = Math.min(0.12, sourceCount * 0.03);
  const score = usedLiveReads ? base + sourceBoost : base + sourceBoost - heuristicOnlyPenalty;

  return Math.max(0.35, Math.min(0.92, Number(score.toFixed(2))));
}
