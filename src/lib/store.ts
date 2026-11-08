import { get, set, del, keys } from "idb-keyval";

export type Profile = {
  displayName: string;
  camera: "user" | "environment";
  fontSize: number;
  speed: number; // 1-10
  mirror: boolean;
  mode: "voice" | "auto";
};

export type Script = { id: string; title: string; body: string; savedAt: number; current: boolean };

export type Recording = {
  id: string;
  title: string;
  createdAt: number;
  duration: number; // seconds
  blob: Blob;
  format: string;
  saved: boolean;
  thumbnail?: string;
};

export const SAMPLE_SCRIPT: Script = {
  id: "sunday-market-refill",
  title: "Sunday Market Refill",
  body:
    "If your pantry feels chaotic, start with one shelf. Pull everything out, group the staples you actually use, and give the everyday items the easiest reach. A ten-minute reset can make tomorrow’s breakfast feel much simpler.",
  savedAt: 0,
  current: true,
};

export const DEFAULT_PROFILE: Profile = {
  displayName: "Maya Chen",
  camera: "user",
  fontSize: 34,
  speed: 5,
  mirror: false,
  mode: "voice",
};

const PK = "tp.profile";
const SK = "tp.script";

export function loadProfile(): Profile {
  try {
    return { ...DEFAULT_PROFILE, ...JSON.parse(localStorage.getItem(PK) || "{}") };
  } catch {
    return DEFAULT_PROFILE;
  }
}
export const saveProfile = (p: Profile) => localStorage.setItem(PK, JSON.stringify(p));

export function loadScript(): Script {
  try {
    const s = localStorage.getItem(SK);
    return s ? JSON.parse(s) : SAMPLE_SCRIPT;
  } catch {
    return SAMPLE_SCRIPT;
  }
}
export const saveScript = (s: Script) => localStorage.setItem(SK, JSON.stringify(s));

const RK = "rec:";
export async function listRecordings(): Promise<Recording[]> {
  const ks = (await keys()).filter((k) => String(k).startsWith(RK));
  const all = await Promise.all(ks.map((k) => get<Recording>(k)));
  return (all.filter(Boolean) as Recording[]).sort((a, b) => b.createdAt - a.createdAt);
}
export const putRecording = (r: Recording) => set(RK + r.id, r);
export const deleteRecording = (id: string) => del(RK + id);

export function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of ["video/mp4;codecs=avc1,mp4a", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"]) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
}

export const extFor = (fmt: string) => (fmt.includes("mp4") ? "mp4" : "webm");
export const fmtTime = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
