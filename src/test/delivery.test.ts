import { describe, expect, it } from "vitest";
import { currentDeliverySegment, scriptWords, validateDeliverySegments, type DeliveryMap } from "@/lib/delivery";

const script = "Hey everyone! Today I'll share three quick tricks. First, treat them like fresh flowers.";
const valid = [
  { startWord: 0, endWord: 2, pace: "natural", pitch: "steady", volume: "conversational", emotion: "warm", emphasis: [0], pauseAfterMs: 250, cue: "Warm opening" },
  { startWord: 2, endWord: 7, pace: "brisk", pitch: "lift", volume: "conversational", emotion: "confident", emphasis: [4, 5], pauseAfterMs: 500, cue: "Build interest" },
  { startWord: 7, endWord: 13, pace: "measured", pitch: "fall", volume: "conversational", emotion: "neutral", emphasis: [], pauseAfterMs: 350, cue: "Explain clearly" },
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
