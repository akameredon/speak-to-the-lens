export const DELIVERY_STYLES = [
  "social-camera", "inspirational", "testimony-storytelling", "teaching",
  "persuasive", "formal", "sermon-prayer", "debate-interview",
] as const;

export type DeliveryStyle = (typeof DELIVERY_STYLES)[number];
export type DeliveryPace = "slow" | "measured" | "natural" | "brisk";
export type DeliveryPitch = "lower" | "steady" | "lift" | "fall" | "varied";
export type DeliveryVolume = "soft" | "conversational" | "projected";
export type DeliveryEmotion = "warm" | "confident" | "curious" | "reflective" | "urgent" | "joyful" | "serious" | "neutral";

export type DeliverySegment = {
  startWord: number;
  endWord: number;
  pace: DeliveryPace;
  pitch: DeliveryPitch;
  volume: DeliveryVolume;
  emotion: DeliveryEmotion;
  emphasis: number[];
  pauseAfterMs: number;
  cue: string;
};

export type DeliveryMap = {
  style: DeliveryStyle;
  audience: string;
  setting: string;
  segments: DeliverySegment[];
};

export const DELIVERY_STYLE_LABELS: Record<DeliveryStyle, string> = {
  "social-camera": "Social media / camera",
  inspirational: "Inspirational / motivational",
  "testimony-storytelling": "Testimony / storytelling",
  teaching: "Teaching / educational",
  persuasive: "Persuasive / sales",
  formal: "Formal / professional",
  "sermon-prayer": "Preaching / prayer",
  "debate-interview": "Debate / interview",
};

export function scriptWords(script: string): string[] {
  return script.trim().split(/\s+/).filter(Boolean);
}

/** Rejects missing, duplicated, reordered, overlapping or invented word ranges. */
export function validateDeliverySegments(
  script: string,
  candidate: unknown,
): DeliverySegment[] | null {
  if (!Array.isArray(candidate) || candidate.length === 0) return null;
  const words = scriptWords(script);
  if (!words.length) return null;

  const pace = new Set<DeliveryPace>(["slow", "measured", "natural", "brisk"]);
  const pitch = new Set<DeliveryPitch>(["lower", "steady", "lift", "fall", "varied"]);
  const volume = new Set<DeliveryVolume>(["soft", "conversational", "projected"]);
  const emotion = new Set<DeliveryEmotion>(["warm", "confident", "curious", "reflective", "urgent", "joyful", "serious", "neutral"]);
  const result: DeliverySegment[] = [];
  let expectedStart = 0;

  for (const raw of candidate) {
    if (!raw || typeof raw !== "object") return null;
    const item = raw as Record<string, unknown>;
    const startWord = item.startWord;
    const endWord = item.endWord;
    if (!Number.isInteger(startWord) || !Number.isInteger(endWord)) return null;
    if (startWord !== expectedStart || (endWord as number) <= (startWord as number) || (endWord as number) > words.length) return null;
    if (!pace.has(item.pace as DeliveryPace) || !pitch.has(item.pitch as DeliveryPitch) ||
        !volume.has(item.volume as DeliveryVolume) || !emotion.has(item.emotion as DeliveryEmotion)) return null;
    if (!Array.isArray(item.emphasis) || item.emphasis.some((n) => !Number.isInteger(n) || (n as number) < startWord || (n as number) >= (endWord as number))) return null;
    if (!Number.isInteger(item.pauseAfterMs) || (item.pauseAfterMs as number) < 0 || (item.pauseAfterMs as number) > 2500) return null;
    if (typeof item.cue !== "string" || item.cue.length > 100) return null;

    result.push({
      startWord: startWord as number,
      endWord: endWord as number,
      pace: item.pace as DeliveryPace,
      pitch: item.pitch as DeliveryPitch,
      volume: item.volume as DeliveryVolume,
      emotion: item.emotion as DeliveryEmotion,
      emphasis: item.emphasis as number[],
      pauseAfterMs: item.pauseAfterMs as number,
      cue: item.cue,
    });
    expectedStart = endWord as number;
  }

  return expectedStart === words.length ? result : null;
}

export function currentDeliverySegment(map: DeliveryMap | null, position: number): DeliverySegment | null {
  if (!map) return null;
  return map.segments.find((segment) => position >= segment.startWord && position < segment.endWord) ?? null;
}

/** Return the next pre-planned speaking-group boundary. */
export function nextDeliveryPosition(map: DeliveryMap | null, words: string[], position: number): number {
  if (map) {
    const current = currentDeliverySegment(map, position);
    if (current) return current.endWord;
    const next = map.segments.find((segment) => segment.startWord > position);
    if (next) return next.endWord;
  }
  for (let i = Math.max(0, position); i < words.length; i++) {
    if (/[.!?][”’"')\]]*$/.test(words[i])) return i + 1;
  }
  return Math.min(words.length, position + 1);
}

/** Return the start of the previous planned group, or previous sentence. */
export function previousDeliveryPosition(map: DeliveryMap | null, words: string[], position: number): number {
  if (map) {
    const previous = [...map.segments].reverse().find((segment) => segment.endWord <= position);
    if (previous) return previous.startWord;
    const current = currentDeliverySegment(map, position);
    if (current && current.startWord < position) return current.startWord;
  }
  for (let i = Math.min(words.length - 1, position - 2); i >= 0; i--) {
    if (/[.!?][”’"')\]]*$/.test(words[i])) return i + 1;
  }
  return 0;
}
