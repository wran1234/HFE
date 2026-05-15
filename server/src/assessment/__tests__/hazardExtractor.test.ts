import { extractHazardsFromModelResponse } from "../hazardExtractor";

const baseInput = {
  sessionId: "s1",
  roomType: "bathroom" as const,
  roomScanId: "rs1",
  evidenceImagePath: "evidence/a.jpg",
};

describe("extractHazardsFromModelResponse", () => {
  it("returns observation for valid hazard json", () => {
    const modelText = `before
<<HAZARD_JSON>>
{"hazardType":"poor_lighting","hazard":"urgent poor light","risk":"fall risk","recommendation":"add light"}
<</HAZARD_JSON>>
after`;
    const result = extractHazardsFromModelResponse({ ...baseInput, modelText });
    expect(result).toHaveLength(1);
    expect(result[0].hazardType).toBe("poor_lighting");
    expect(result[0].sessionId).toBe("s1");
  });

  it("returns multiple observations for multiple blocks", () => {
    const modelText = `<<HAZARD_JSON>>{"hazardType":"poor_lighting","hazard":"high risk","risk":"risk","recommendation":"fix"}<</HAZARD_JSON>>
<<HAZARD_JSON>>{"hazardType":"loose_rug","hazard":"medium risk","risk":"risk","recommendation":"fix"}<</HAZARD_JSON>>`;
    const result = extractHazardsFromModelResponse({ ...baseInput, modelText });
    expect(result).toHaveLength(2);
  });

  it("returns empty array for malformed json", () => {
    const modelText = `<<HAZARD_JSON>>{"hazardType":"poor_lighting",bad}<</HAZARD_JSON>>`;
    expect(() =>
      extractHazardsFromModelResponse({ ...baseInput, modelText })
    ).not.toThrow();
    expect(extractHazardsFromModelResponse({ ...baseInput, modelText })).toEqual([]);
  });

  it("returns empty array for empty modelText", () => {
    expect(extractHazardsFromModelResponse({ ...baseInput, modelText: "" })).toEqual([]);
  });

  it("returns empty array when markers are missing", () => {
    const result = extractHazardsFromModelResponse({
      ...baseInput,
      modelText: "plain text only",
    });
    expect(result).toEqual([]);
  });

  it("discards unknown hazardType values", () => {
    const modelText = `<<HAZARD_JSON>>{"hazardType":"unknown_type","hazard":"high risk","risk":"risk","recommendation":"fix"}<</HAZARD_JSON>>`;
    const result = extractHazardsFromModelResponse({ ...baseInput, modelText });
    expect(result).toEqual([]);
  });

  it("maps severity words to expected severity", () => {
    const critical = extractHazardsFromModelResponse({
      ...baseInput,
      modelText: `<<HAZARD_JSON>>{"hazardType":"poor_lighting","hazard":"urgent issue","risk":"","recommendation":""}<</HAZARD_JSON>>`,
    });
    const high = extractHazardsFromModelResponse({
      ...baseInput,
      modelText: `<<HAZARD_JSON>>{"hazardType":"poor_lighting","hazard":"high danger","risk":"","recommendation":""}<</HAZARD_JSON>>`,
    });
    const low = extractHazardsFromModelResponse({
      ...baseInput,
      modelText: `<<HAZARD_JSON>>{"hazardType":"poor_lighting","hazard":"minor note","risk":"","recommendation":""}<</HAZARD_JSON>>`,
    });
    expect(critical[0].severityHint).toBe("critical");
    expect(high[0].severityHint).toBe("high");
    expect(low[0].severityHint).toBe("low");
  });

  it("sets followUpNeeded true for short modelNote", () => {
    const modelText = `<<HAZARD_JSON>>{"hazardType":"poor_lighting","hazard":"short","risk":"","recommendation":""}<</HAZARD_JSON>>`;
    const result = extractHazardsFromModelResponse({ ...baseInput, modelText });
    expect(result[0].followUpNeeded).toBe(true);
  });

  it("sets followUpNeeded false for long modelNote", () => {
    const modelText = `<<HAZARD_JSON>>{"hazardType":"poor_lighting","hazard":"this is a very long hazard note that should exceed forty characters","risk":"","recommendation":""}<</HAZARD_JSON>>`;
    const result = extractHazardsFromModelResponse({ ...baseInput, modelText });
    expect(result[0].followUpNeeded).toBe(false);
  });

  it("does not include confidence in output", () => {
    const modelText = `<<HAZARD_JSON>>{"hazardType":"poor_lighting","hazard":"high risk","risk":"risk","recommendation":"fix"}<</HAZARD_JSON>>`;
    const result = extractHazardsFromModelResponse({ ...baseInput, modelText });
    expect(Object.prototype.hasOwnProperty.call(result[0], "confidence")).toBe(false);
  });
});
