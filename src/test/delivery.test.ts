import { describe, expect, it } from "vitest";
import { advanceRecognizedDeliveryGroup, autoAdvanceDelay, currentDeliverySegment, nextDeliveryPosition, previousDeliveryPosition, scriptWords, validateDeliverySegments, type DeliveryMap } from "@/lib/delivery";

const script = "Hey everyone! Today I'll share three quick tricks. First, treat them like fresh flowers.";
const valid = [
  { startWord: 0, endWord: 2, pace: "natural", pitch: "steady", volume: "conversational", emotion: "warm", emphasis: [0], pauseAfterMs: 250, cue: "Warm opening" },
  { startWord: 2, endWord: 7, pace: "brisk", pitch: "lift", volume: "conversational", emotion: "confident", emphasis: [4, 5], pauseAfterMs: 500, cue: "Build interest" },
  { startWord: 7, endWord: 14, pace: "measured", pitch: "fall", volume: "conversational", emotion: "neutral", emphasis: [], pauseAfterMs: 350, cue: "Explain clearly" },
];

describe("Speak Intelligence phrase map validation", () => {
  it("tokenizes the complete script consistently", () => {
    expect(scriptWords("  Hey\n everyone!  ")).toEqual(["Hey", "everyone!"]);
  });

  it("accepts variable-length contiguous phrase groups", () => {
    expect(validateDeliverySegments(script, valid)).toEqual(valid);
  });

  it("rejects a missing word range", () => {
    expect(validateDeliverySegments(script, valid.slice(0, 2))).toBeNull();
  });

  it("rejects overlapping, reordered or skipped ranges", () => {
    const overlap = [{ ...valid[0], endWord: 3 }, ...valid.slice(1)];
    expect(validateDeliverySegments(script, overlap)).toBeNull();
  });

  it("rejects emphasis outside its phrase and invalid pauses", () => {
    const bad = [{ ...valid[0], emphasis: [2], pauseAfterMs: 9000 }, ...valid.slice(1)];
    expect(validateDeliverySegments(script, bad)).toBeNull();
  });

  it("finds the phrase containing the current reading position", () => {
    const segments = validateDeliverySegments(script, valid)!;
    const map: DeliveryMap = { style: "social-camera", audience: "general", setting: "camera", segments };
    expect(currentDeliverySegment(map, 4)?.cue).toBe("Build interest");
    expect(currentDeliverySegment(map, 99)).toBeNull();
  });
});

describe("instant phrase navigation", () => {
  const words = scriptWords("Hey everyone! Today I'll share three quick tricks. First, treat them like fresh flowers.");
  const map: DeliveryMap = {
    style: "social-camera",
    audience: "general",
    setting: "camera",
    segments: [
      { startWord: 0, endWord: 2, pace: "natural", pitch: "steady", volume: "conversational", emotion: "warm", emphasis: [], pauseAfterMs: 0, cue: "Open warmly" },
      { startWord: 2, endWord: 8, pace: "measured", pitch: "lift", volume: "conversational", emotion: "confident", emphasis: [], pauseAfterMs: 200, cue: "Build interest" },
      { startWord: 8, endWord: words.length, pace: "natural", pitch: "fall", volume: "conversational", emotion: "neutral", emphasis: [], pauseAfterMs: 300, cue: "Explain clearly" },
    ],
  };

  it("jumps immediately to the end of the highlighted phrase", () => {
    expect(nextDeliveryPosition(map, words, 0)).toBe(2);
    expect(nextDeliveryPosition(map, words, 2)).toBe(8);
  });

  it("returns to the previous complete phrase", () => {
    expect(previousDeliveryPosition(map, words, 8)).toBe(2);
    expect(previousDeliveryPosition(map, words, 2)).toBe(0);
  });

  it("uses sentence boundaries if no AI delivery map exists", () => {
    expect(nextDeliveryPosition(null, words, 0)).toBe(2);
    expect(previousDeliveryPosition(null, words, 8)).toBe(2);
  });
});

describe("phrase-aware voice following", () => {
  const words = scriptWords("Hey everyone! Today I'll share three quick tricks.");
  const map: DeliveryMap = {
    style: "social-camera",
    audience: "general",
    setting: "camera",
    segments: [
      { startWord: 0, endWord: 2, pace: "natural", pitch: "steady", volume: "conversational", emotion: "warm", emphasis: [], pauseAfterMs: 0, cue: "Open warmly" },
      { startWord: 2, endWord: words.length, pace: "measured", pitch: "lift", volume: "conversational", emotion: "confident", emphasis: [], pauseAfterMs: 0, cue: "Build interest" },
    ],
  };

  it("keeps the full current group highlighted during partial speech", () => {
    expect(advanceRecognizedDeliveryGroup(words, map, 0, "Hey")).toBe(0);
  });

  it("moves to the next group only when the current phrase is completed", () => {
    expect(advanceRecognizedDeliveryGroup(words, map, 0, "Hey everyone")).toBe(2);
  });
});


describe("automatic reading pace", () => {
  it("respects the selected speed and delivery pace", () => {
    expect(autoAdvanceDelay(5, "slow")).toBeGreaterThan(autoAdvanceDelay(5, "natural"));
    expect(autoAdvanceDelay(5, "natural")).toBeGreaterThan(autoAdvanceDelay(5, "brisk"));
  });

  it("adds rhetorical pauses and clamps invalid preferences", () => {
    expect(autoAdvanceDelay(5, "natural", 500) - autoAdvanceDelay(5, "natural", 0)).toBe(500);
    expect(autoAdvanceDelay(99, "natural")).toBe(autoAdvanceDelay(10, "natural"));
    expect(autoAdvanceDelay(-10, "natural")).toBe(autoAdvanceDelay(1, "natural"));
  });
});
