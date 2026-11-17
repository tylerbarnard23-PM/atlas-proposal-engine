import { describe, expect, it } from "vitest";
import { DOCUMENT_WIDTH_PX, MIN_FIT_SCALE, fitScale } from "@/app/meeting/[id]/meetingFit";

// D5: the meeting view fits the 8.5in document to narrow screens on screen
// only. The document, PDF route and print output are covered in
// approvedSnapshot.test.ts; this is the scale the wrapper applies.

describe("meeting view fit scale", () => {
  it("is the document's printed width, 8.5in at 96px per inch", () => {
    expect(DOCUMENT_WIDTH_PX).toBe(8.5 * 96);
  });

  it("scales down to the available width on a phone and a narrow tablet, never up", () => {
    expect(fitScale(375)).toBe(0.459);
    expect(fitScale(768)).toBe(0.941);
    expect(fitScale(375) * DOCUMENT_WIDTH_PX).toBeLessThanOrEqual(375);
    expect(fitScale(768) * DOCUMENT_WIDTH_PX).toBeLessThanOrEqual(768);
    expect(fitScale(816)).toBe(1);
    expect(fitScale(1360)).toBe(1);
  });

  it("keeps a floor for very narrow windows and ignores unusable measurements", () => {
    expect(fitScale(120)).toBe(MIN_FIT_SCALE);
    expect(fitScale(0)).toBe(1);
    expect(fitScale(Number.NaN)).toBe(1);
  });
});
