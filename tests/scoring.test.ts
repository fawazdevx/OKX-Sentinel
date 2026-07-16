import { describe, expect, it } from "vitest";
import type { RiskFinding } from "../src/shared/types";
import { findingToScore, riskLevelFromScore } from "../src/shared/scoring";

function finding(severity: RiskFinding["severity"]): RiskFinding {
  return {
    id: `finding.${severity}`,
    title: `${severity} finding`,
    severity,
    category: "approval",
    description: "Test finding"
  };
}

describe("risk scoring", () => {
  it("maps low finding sets to low risk", () => {
    const score = findingToScore([finding("low")], 4);

    expect(score).toBeLessThan(35);
    expect(riskLevelFromScore(score)).toBe("Low");
  });

  it("forces high risk for critical findings", () => {
    const score = findingToScore([finding("critical")], 8);

    expect(score).toBeGreaterThanOrEqual(82);
    expect(riskLevelFromScore(score)).toBe("High");
  });

  it("marks accumulated severe findings as critical", () => {
    const score = findingToScore([finding("critical"), finding("high"), finding("high")], 18);

    expect(score).toBe(100);
    expect(riskLevelFromScore(score)).toBe("Critical");
  });
});
