import type { ExtractedHolding } from "@/domain/types";
import { detectStatementWarnings } from "./detectStatementWarnings";
import { calculateHoldingConfidence } from "./calculateIngestionConfidence";

export function validateExtractedHolding(h: ExtractedHolding): ExtractedHolding {
  const warnings = [...h.warnings, ...detectStatementWarnings(h)];
  return { ...h, warnings, confidence: calculateHoldingConfidence({ ...h, warnings }) };
}
