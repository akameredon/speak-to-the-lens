import { get, set, del, keys } from "idb-keyval";

export type Profile = {
  displayName: string;
  camera: "user" | "environment";
  fontSize: number;
  speed: number; // 1-10
  mirror: boolean;
  mode: "manual" | "voice" | "auto";
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
  mode: "manual",
};

const PK = "tp.profile";
const SK = "tp.script";
const MODE_MIGRATION_KEY = "tp.mode-migration.v1";

export function loadProfile(): Profile {
  try {
    const profile = { ...DEFAULT_PROFILE, ...JSON.parse(localStorage.getItem(PK) || "{}") } as Profile;
    if (localStorage.getItem(MODE_MIGRATION_KEY) !== "1") {
      profile.mode = "manual";
      localStorage.setItem(MODE_MIGRATION_KEY, "1");
    }
    return profile;
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
const SCRIPTS_KEY = "tp.scripts";

function isScript(value: unknown): value is Script {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<Script>;
  return typeof item.id === "string" && typeof item.title === "string" &&
    typeof item.body === "string" && typeof item.savedAt === "number";
}

/** Read the script library, migrating the previous single-script key without losing it. */
export function loadScripts(): Script[] {
  try {
    const raw = localStorage.getItem(SCRIPTS_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const valid = parsed.filter(isScript);
        if (valid.length) return valid;
      }
    }
  } catch {
    // Fall back to the previous single-script format below.
  }
  return [loadScript()];
}

function persistScripts(scripts: Script[]) {
  const current = scripts.find((item) => item.current) ?? scripts[0];
  const normalized = scripts.map((item) => ({ ...item, current: item.id === current?.id }));
  localStorage.setItem(SCRIPTS_KEY, JSON.stringify(normalized));
  if (current) localStorage.setItem(SK, JSON.stringify({ ...current, current: true }));
}

export function loadCurrentScript(): Script {
  return loadScripts().find((item) => item.current) ?? loadScript();
}

/** Save the current script while retaining every other script on this device. */
export function saveScript(script: Script) {
  const scripts = loadScripts();
  const next = scripts.some((item) => item.id === script.id)
    ? scripts.map((item) => item.id === script.id ? { ...script, current: true } : { ...item, current: false })
    : [...scripts.map((item) => ({ ...item, current: false })), { ...script, current: true }];
  persistScripts(next);
}

export function setCurrentScript(id: string): Script | undefined {
  const scripts = loadScripts();
  const selected = scripts.find((item) => item.id === id);
  if (!selected) return undefined;
  persistScripts(scripts.map((item) => ({ ...item, current: item.id === id })));
  return { ...selected, current: true };
}

export function createScript(title = "Untitled script"): Script {
  const id = typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : "script-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
  const script: Script = { id, title, body: "", savedAt: Date.now(), current: true };
  persistScripts([...loadScripts().map((item) => ({ ...item, current: false })), script]);
  return script;
}

/** Keep at least one script so the editor can never become an empty library. */
export function deleteScript(id: string): Script {
  const scripts = loadScripts();
  if (scripts.length <= 1) return scripts[0] ?? loadScript();
  const remaining = scripts.filter((item) => item.id !== id);
  const current = remaining.find((item) => item.current) ?? remaining[remaining.length - 1];
  persistScripts(remaining.map((item) => ({ ...item, current: item.id === current.id })));
  return { ...current, current: true };
}

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
