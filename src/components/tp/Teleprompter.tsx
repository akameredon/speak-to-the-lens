import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown, ArrowUp, Camera, Clapperboard, Download, FileText, FlipHorizontal2, Headphones, Mic,
  Pause, Play, Share2, Sparkles, Trash2, Wand2, X, ClipboardPaste, Timer, Film, Check,
} from "lucide-react";
import { toast } from "sonner";
import { advance, tokenize } from "@/lib/follow";
import {
  type Profile, type Recording, type Script, createScript, deleteRecording, deleteScript, extFor, fmtTime, listRecordings,
  loadCurrentScript, loadProfile, loadScripts, pickMime, putRecording, saveProfile, saveScript, setCurrentScript,
} from "@/lib/store";
import { speechSupported, useSpeech } from "./useSpeech";
import { streamScript } from "./ai";
import {
  advanceRecognizedDeliveryGroup, currentDeliverySegment, nextDeliveryPosition, previousDeliveryPosition, DELIVERY_STYLES, DELIVERY_STYLE_LABELS,
  type DeliveryMap, type DeliveryStyle,
} from "@/lib/delivery";

type Tab = "film" | "script" | "write" | "takes";
type Notice = { title: string; body: string; action?: { label: string; run: () => void } } | null;

export default function Teleprompter() {
  const [profile, setProfile] = useState<Profile>(loadProfile);
  const [script, setScript] = useState<Script>(loadCurrentScript);
  const [scripts, setScripts] = useState<Script[]>(loadScripts);
  const [tab, setTab] = useState<Tab>("film");
  const [pos, setPos] = useState(0);
  const [running, setRunning] = useState(false);
  const [activeMode, setActiveMode] = useState<Profile["mode"]>(profile.mode);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [review, setReview] = useState<Recording | null>(null);
  const [takes, setTakes] = useState<Recording[]>([]);
  const [help, setHelp] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [camReady, setCamReady] = useState(false);
  const [deliveryMap, setDeliveryMap] = useState<DeliveryMap | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startRef = useRef(0);
  const thumbRef = useRef<string | undefined>(undefined);

  const words = useMemo(() => tokenize(script.body), [script.body]);
  const posRef = useRef(pos);
  posRef.current = pos;

  // persist
  useEffect(() => saveProfile(profile), [profile]);
  useEffect(() => {
    const t = setTimeout(() => {
      saveScript({ ...script, savedAt: Date.now() });
      setScripts(loadScripts());
    }, 400);
    return () => clearTimeout(t);
  }, [script]);
  const refreshTakes = useCallback(() => listRecordings().then(setTakes).catch(() => setTakes([])), []);
  useEffect(() => void refreshTakes(), [refreshTakes]);
  useEffect(() => setPos((p) => Math.min(p, words.length)), [words.length]);

  // camera
  useEffect(() => {
    if (tab !== "film") return;
    let cancelled = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setNotice({ title: "Camera not available", body: "This browser can't open the camera. Try Safari on iPhone or Chrome on Android, over a secure (https) link." });
        return;
      }
      try {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: profile.camera, width: { ideal: 1080 }, height: { ideal: 1920 } },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        streamRef.current = s;
        if (videoRef.current) videoRef.current.srcObject = s;
        setCamReady(true);
      } catch (e) {
        const name = (e as DOMException).name;
        setCamReady(false);
        if (name === "NotAllowedError")
          setNotice({ title: "Camera or microphone blocked", body: "Allow camera and microphone for this site in your browser settings, then reload. You can still read and edit your script." });
        else if (name === "NotFoundError" || name === "OverconstrainedError")
          setNotice({ title: "No camera found", body: "We couldn't find a camera on this device. Try flipping cameras or use a phone." });
        else setNotice({ title: "Camera didn't start", body: "Another app may be using the camera. Close it and try again." });
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setCamReady(false);
    };
  }, [profile.camera, tab]);
  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);

  // voice
  const speech = useSpeech(
    (text) => setPos((p) => advanceRecognizedDeliveryGroup(words, deliveryMap, p, text)),
    (reason) => {
      setActiveMode("auto");
      toast(reason === "not-allowed" || reason === "service-not-allowed"
        ? "Microphone blocked for voice following — switched to tap to advance."
        : reason === "unsupported"
          ? "Voice following isn't supported here — using tap to advance."
          : "Voice following stopped — tap to advance is ready.");
    },
  );

  // Auto-scroll follows the delivery map's pace and honours rhetorical pauses.
  useEffect(() => {
    if (!running || activeMode !== "auto" || pos >= words.length) return;
    const wpm = 70 + profile.speed * 16;
    const segment = currentDeliverySegment(deliveryMap, pos);
    const paceScale = segment?.pace === "slow" ? 1.45
      : segment?.pace === "measured" ? 1.18
        : segment?.pace === "brisk" ? 0.82 : 1;
    const previousPause = deliveryMap?.segments.find((item) => item.endWord === pos)?.pauseAfterMs ?? 0;
    const delay = Math.round((60000 / wpm) * paceScale + previousPause);
    const id = window.setTimeout(() => setPos((current) => Math.min(words.length, current + 1)), delay);
    return () => window.clearTimeout(id);
  }, [running, activeMode, profile.speed, words.length, pos, deliveryMap]);

  const startReading = useCallback(() => {
    const mode = profile.mode === "voice" && !speechSupported() ? "manual" : profile.mode;
    if (profile.mode === "voice" && mode === "manual") toast("Voice following isn't supported here — using tap to advance.");
    setActiveMode(mode);
    if (mode === "voice") speech.start();
    setRunning(true);
  }, [profile.mode, speech]);
  const stopReading = useCallback(() => {
    speech.stop();
    setRunning(false);
  }, [speech]);
  useEffect(() => {
    if (pos >= words.length && running && !recording) stopReading();
  }, [pos, words.length, running, recording, stopReading]);

  // recording
  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setElapsed((Date.now() - startRef.current) / 1000), 250);
    return () => clearInterval(id);
  }, [recording]);

  const grabThumb = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return undefined;
    const c = document.createElement("canvas");
    c.width = 180;
    c.height = Math.round((180 * v.videoHeight) / v.videoWidth);
    c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.7);
  };

  const startRecording = () => {
    const s = streamRef.current;
    if (!s || typeof MediaRecorder === "undefined") {
      setNotice({ title: "Recording not available", body: "This browser can't record video. Try Safari on iPhone (iOS 14.3+) or Chrome on Android." });
      return;
    }
    const mime = pickMime();
    let r: MediaRecorder;
    try {
      r = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
    } catch {
      setNotice({ title: "Recording format unavailable", body: "This browser could not start a recording with its supported video format. Try another browser or update this one." });
      return;
    }
    chunksRef.current = [];
    r.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
    r.onstop = () => {
      const fmt = r.mimeType || mime || "video/webm";
      const blob = new Blob(chunksRef.current, { type: fmt });
      const duration = (Date.now() - startRef.current) / 1000;
      setReview({
        id: crypto.randomUUID(),
        title: `${script.title} · Take`,
        createdAt: Date.now(),
        duration,
        blob,
        format: fmt,
        saved: false,
        thumbnail: thumbRef.current,
      });
    };
    thumbRef.current = grabThumb();
    startRef.current = Date.now();
    setElapsed(0);
    try {
      r.start(1000);
      recorderRef.current = r;
      setRecording(true);
      if (!running) startReading();
    } catch {
      recorderRef.current = null;
      setRecording(false);
      setNotice({ title: "Recording could not start", body: "The browser refused to start video recording. Check camera and microphone permissions, then try again." });
    }
  };
  const stopRecording = () => {
    const active = recorderRef.current;
    recorderRef.current = null;
    try {
      if (active && active.state !== "inactive") active.stop();
    } catch {
      setNotice({ title: "Recording could not finish", body: "The browser interrupted the recording. Any completed take may not be recoverable." });
    }
    setRecording(false);
    stopReading();
  };

  const chooseScript = (id: string) => {
    const selected = setCurrentScript(id);
    if (!selected) return;
    setScript(selected);
    setScripts(loadScripts());
    setPos(0);
    setDeliveryMap(null);
  };
  const addScript = () => {
    const created = createScript();
    setScript(created);
    setScripts(loadScripts());
    setPos(0);
    setDeliveryMap(null);
    setTab("script");
  };
  const removeScript = () => {
    if (scripts.length <= 1) return toast("Keep at least one script on this device.");
    if (!confirm("Delete this script from this device?")) return;
    const next = deleteScript(script.id);
    setScript(next);
    setScripts(loadScripts());
    setPos(0);
    setDeliveryMap(null);
    toast("Script deleted from this device.");
  };

  const upd = (p: Partial<Profile>) => setProfile((x) => ({ ...x, ...p }));

  return (
    <div className="fixed inset-0 flex flex-col bg-background text-foreground">
      <div className="relative flex-1 overflow-hidden">
        {tab === "film" && (
          <FilmSurface
            videoRef={videoRef}
            camReady={camReady}
            profile={profile}
            words={words}
            deliveryMap={deliveryMap}
            pos={pos}
            setPos={setPos}
            running={running}
            activeMode={activeMode}
            listening={speech.listening}
            recording={recording}
            elapsed={elapsed}
            upd={upd}
            onToggleRead={() => (running ? stopReading() : (pos >= words.length && setPos(0), startReading()))}
            onAdvance={() => setPos((current) => nextDeliveryPosition(deliveryMap, words, current))}
            onPrevious={() => setPos((current) => previousDeliveryPosition(deliveryMap, words, current))}
            onRecord={() => (recording ? stopRecording() : startRecording())}
            onEdit={() => setTab("script")}
            onHelp={() => setHelp(true)}
            onSwitchMode={() => {
              const next = activeMode === "manual" ? "voice" : activeMode === "voice" ? "auto" : "manual";
              if (next === "voice" && !speechSupported()) {
                speech.stop();
                setActiveMode("manual");
                upd({ mode: "manual" });
                toast("Voice following isn't supported here — tap to advance is ready.");
                return;
              }
              upd({ mode: next });
              if (next === "voice") speech.start();
              else speech.stop();
              setActiveMode(next);
            }}
          />
        )}
        {tab === "script" && (
          <ScriptEditor
            script={script}
            scripts={scripts}
            deliveryMap={deliveryMap}
            onDeliveryMap={setDeliveryMap}
            setScript={(s) => { setScript(s); setPos(0); setDeliveryMap(null); }}
            onSelectScript={chooseScript}
            onNewScript={addScript}
            onDeleteScript={removeScript}
            onWrite={() => setTab("write")}
          />
        )}
        {tab === "write" && (
          <Writer
            onStream={(t) => { setScript((s) => ({ ...s, body: t })); setDeliveryMap(null); }}
            onStart={(topic) => { setScript((s) => ({ ...s, title: topic.slice(0, 48) || s.title, body: "" })); setTab("script"); setPos(0); }}
          />
        )}
        {tab === "takes" && <Takes takes={takes} refresh={refreshTakes} onOpen={setReview} />}
      </div>

      <nav className="flex border-t border-border bg-background pb-[env(safe-area-inset-bottom)]">
        {([
          ["film", "Film", Camera],
          ["script", "Script", FileText],
          ["write", "Write", Sparkles],
          ["takes", "Takes", Film],
        ] as const).map(([k, label, Icon]) => (
          <button
            key={k}
            onClick={() => { if (recording) return toast("Stop recording first."); setTab(k); }}
            className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-medium ${tab === k ? "text-primary" : "text-muted-foreground"}`}
          >
            <Icon className="h-5 w-5" />
            {label}
          </button>
        ))}
      </nav>

      {review && (
        <Review
          rec={review}
          onClose={() => setReview(null)}
          onSaved={async (r) => { await putRecording({ ...r, saved: true }); setReview({ ...r, saved: true }); refreshTakes(); toast("Saved to My Recordings"); }}
        />
      )}
      {help && <AudioHelp onClose={() => setHelp(false)} />}
      {notice && (
        <Sheet onClose={() => setNotice(null)} title={notice.title}>
          <p className="text-sm text-muted-foreground">{notice.body}</p>
          <button onClick={() => setNotice(null)} className="mt-5 w-full rounded-full bg-primary py-3 font-bold text-primary-foreground">Got it</button>
        </Sheet>
      )}
    </div>
  );
}

/* ---------------- Film ---------------- */
function FilmSurface(p: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  camReady: boolean;
  profile: Profile;
  words: string[];
  deliveryMap: DeliveryMap | null;
  pos: number;
  setPos: (n: number | ((x: number) => number)) => void;
  running: boolean;
  activeMode: Profile["mode"];
  listening: boolean;
  recording: boolean;
  elapsed: number;
  upd: (x: Partial<Profile>) => void;
  onToggleRead: () => void;
  onAdvance: () => void;
  onPrevious: () => void;
  onRecord: () => void;
  onEdit: () => void;
  onHelp: () => void;
  onSwitchMode: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const curRef = useRef<HTMLSpanElement>(null);
  const activeDelivery = currentDeliverySegment(p.deliveryMap, p.pos);
  const activeIndex = p.deliveryMap?.segments.findIndex((segment) => segment === activeDelivery) ?? -1;
  const upcomingDelivery = activeIndex >= 0 ? p.deliveryMap?.segments[activeIndex + 1] : undefined;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (!p.running || p.activeMode !== "manual") return;
      if (event.code === "Space" || event.code === "ArrowRight") {
        event.preventDefault();
        p.onAdvance();
      } else if (event.code === "ArrowLeft") {
        event.preventDefault();
        p.onPrevious();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [p.running, p.activeMode, p.onAdvance, p.onPrevious]);
  useEffect(() => {
    const box = boxRef.current, el = curRef.current;
    if (!box || !el) return;
    box.scrollTo({ top: el.offsetTop - box.clientHeight * 0.3, behavior: "smooth" });
  }, [p.pos, p.profile.fontSize]);

  return (
    <div className="absolute inset-0">
      <video
        ref={p.videoRef}
        autoPlay
        playsInline
        muted
        className={`absolute inset-0 h-full w-full object-cover ${p.profile.camera === "user" ? "-scale-x-100" : ""}`}
      />
      {!p.camReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-card text-sm text-muted-foreground">
          <Camera className="mr-2 h-4 w-4" /> Waiting for camera…
        </div>
      )}

      {/* near-lens panel */}
      <div className="absolute inset-x-0 top-0 bg-panel pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="flex items-center justify-between px-4 pt-3 text-xs font-medium text-muted-foreground">
          <button onClick={p.onSwitchMode} className="flex items-center gap-1.5 rounded-full bg-scrim px-3 py-1.5">
            {p.activeMode === "voice" ? <Mic className="h-3.5 w-3.5 text-accent" /> : p.activeMode === "auto" ? <Timer className="h-3.5 w-3.5 text-accent" /> : <Play className="h-3.5 w-3.5 text-accent" />}
            {p.activeMode === "voice" ? (p.listening ? "Voice follow · listening" : "Voice follow") : p.activeMode === "auto" ? "Auto pace" : "Tap to advance"}
          </button>
          {p.recording ? (
            <span className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 font-bold text-primary-foreground">
              <span className="rec-pulse h-2 w-2 rounded-full bg-primary-foreground" /> {fmtTime(p.elapsed)}
            </span>
          ) : (
            <button onClick={p.onHelp} className="flex items-center gap-1.5 rounded-full bg-scrim px-3 py-1.5">
              <Headphones className="h-3.5 w-3.5" /> Audio tips
            </button>
          )}
        </div>
        {activeDelivery && (
          <div className="space-y-1 px-4 pb-2">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
              <span className="rounded-full bg-accent px-2 py-1 text-accent-foreground">Group {activeIndex + 1} / {p.deliveryMap?.segments.length}</span>
              <span className="rounded-full bg-scrim px-2 py-1">{activeDelivery.pace}</span>
            <span className="rounded-full bg-scrim px-2 py-1">{activeDelivery.emotion}</span>
            <span className="rounded-full bg-scrim px-2 py-1">Pitch: {activeDelivery.pitch}</span>
            <span className="rounded-full bg-scrim px-2 py-1">Volume: {activeDelivery.volume}</span>
            <span className="text-muted-foreground">{activeDelivery.cue}</span>
              {activeDelivery.pauseAfterMs > 0 && <span className="text-muted-foreground">Pause {activeDelivery.pauseAfterMs} ms after phrase</span>}
            </div>
            {upcomingDelivery && (
              <div className="truncate text-[11px] text-foreground/65">
                <span className="mr-2 font-bold uppercase tracking-wider text-accent">Next</span>
                {p.words.slice(upcomingDelivery.startWord, upcomingDelivery.endWord).join(" ")}
              </div>
            )}
          </div>
        )}
        <div
          ref={boxRef}
          className="relative h-[34vh] overflow-y-auto px-5 pb-6 pt-2 [scrollbar-width:none]"
          style={{ transform: p.profile.mirror ? "scaleX(-1)" : undefined }}
        >
          <p className="font-extrabold leading-[1.25] tracking-tight" style={{ fontSize: p.profile.fontSize }}>
            {p.deliveryMap ? p.deliveryMap.segments.map((segment, segmentIndex) => {
              const active = p.pos >= segment.startWord && p.pos < segment.endWord;
              const passed = p.pos >= segment.endWord;
              return (
                <span
                  key={segmentIndex}
                  ref={active ? curRef : undefined}
                  onClick={() => p.setPos(segment.startWord)}
                  className={`script-word ${active ? "word-current" : passed ? "word-read" : ""}`}
                  title={segment.cue}
                >
                  {p.words.slice(segment.startWord, segment.endWord).map((word, offset) => (
                    <span key={segment.startWord + offset} className={segment.emphasis.includes(segment.startWord + offset) ? "font-black underline decoration-2 underline-offset-4" : ""}>
                      {word}{" "}
                    </span>
                  ))}
                </span>
              );
            }) : p.words.map((w, i) => (
              <span
                key={i}
                ref={i === Math.min(p.pos, p.words.length - 1) ? curRef : undefined}
                onClick={() => p.setPos(i)}
                className={`script-word ${i === p.pos ? "word-current" : i < p.pos ? "word-read" : ""}`}
              >
                {w}{" "}
              </span>
            ))}
          </p>
        </div>
      </div>

      {/* thumb controls */}
      <div className="absolute inset-x-0 bottom-0 space-y-3 bg-gradient-to-t from-background/90 to-transparent px-4 pb-4 pt-10">
        {p.activeMode === "manual" && (
          <div className="flex justify-center">
            <button onClick={p.onAdvance} disabled={p.pos >= p.words.length} className="rounded-full border border-white/15 bg-background/75 px-6 py-2.5 text-sm font-bold shadow-lg backdrop-blur-xl disabled:opacity-40">
              Done · Next {p.deliveryMap ? "phrase" : "sentence"} <span aria-hidden="true">→</span>
            </button>
          </div>
        )}
        <div className="flex items-center gap-3 rounded-3xl border border-white/10 bg-scrim/80 p-3 shadow-lg backdrop-blur-xl">
          <Control label="Size" value={`${p.profile.fontSize}px`}>
            <input type="range" min={22} max={56} value={p.profile.fontSize} onChange={(e) => p.upd({ fontSize: +e.target.value })} className="w-full accent-[var(--accent)]" aria-label="Font size" />
          </Control>
          {p.activeMode === "auto" && <Control label="Speed" value={String(p.profile.speed)}>
            <input type="range" min={1} max={10} value={p.profile.speed} onChange={(e) => p.upd({ speed: +e.target.value })} className="w-full accent-[var(--accent)]" aria-label="Scroll speed" />
          </Control>}
          <div className="flex flex-col gap-1">
            <button aria-label="Previous phrase" onClick={p.onPrevious} className="rounded-full bg-secondary p-1.5"><ArrowUp className="h-4 w-4" /></button>
            <button aria-label="Next phrase" onClick={p.onAdvance} className="rounded-full bg-secondary p-1.5"><ArrowDown className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <Round label="Edit script" onClick={p.onEdit}><FileText className="h-5 w-5" /></Round>
            <Round label="Mirror text" active={p.profile.mirror} onClick={() => p.upd({ mirror: !p.profile.mirror })}><FlipHorizontal2 className="h-5 w-5" /></Round>
          </div>
          <button
            aria-label={p.recording ? "Stop recording" : "Record"}
            onClick={p.onRecord}
            className="flex h-[76px] w-[76px] items-center justify-center rounded-full border-4 border-foreground"
          >
            <span className={`bg-primary transition-all ${p.recording ? "h-7 w-7 rounded-md" : "h-14 w-14 rounded-full"}`} />
          </button>
          <div className="flex gap-2">
            <Round label={p.running ? "Pause reading" : "Start reading"} onClick={p.onToggleRead}>
              {p.running ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            </Round>
            <Round label="Flip camera" disabled={p.recording} onClick={() => p.upd({ camera: p.profile.camera === "user" ? "environment" : "user" })}><Clapperboard className="h-5 w-5" /></Round>
          </div>
        </div>
      </div>
    </div>
  );
}

function Control({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  return (
    <label className="flex-1">
      <span className="flex justify-between text-[11px] font-medium text-muted-foreground"><span>{label}</span><span className="text-foreground">{value}</span></span>
      {children}
    </label>
  );
}
function Round({ children, label, onClick, active, disabled }: { children: React.ReactNode; label: string; onClick: () => void; active?: boolean; disabled?: boolean }) {
  return (
    <button aria-label={label} title={label} disabled={disabled} onClick={onClick}
      className={`flex h-12 w-12 items-center justify-center rounded-full backdrop-blur-md disabled:opacity-40 ${active ? "bg-accent text-accent-foreground" : "bg-scrim text-foreground"}`}>
      {children}
    </button>
  );
}

/* ---------------- Script ---------------- */
function ScriptEditor({
  script, scripts, deliveryMap, onDeliveryMap, setScript, onSelectScript, onNewScript, onDeleteScript, onWrite,
}: {
  script: Script;
  scripts: Script[];
  deliveryMap: DeliveryMap | null;
  onDeliveryMap: (map: DeliveryMap | null) => void;
  setScript: (s: Script) => void;
  onSelectScript: (id: string) => void;
  onNewScript: () => void;
  onDeleteScript: () => void;
  onWrite: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [coaching, setCoaching] = useState(false);
  const [style, setStyle] = useState<DeliveryStyle>("social-camera");
  const [audience, setAudience] = useState("General audience");
  const [setting, setSetting] = useState("Camera / phone video");
  const [experience, setExperience] = useState<"beginner" | "comfortable" | "experienced">("beginner");
  const words = tokenize(script.body).length;
  const coachDelivery = async () => {
    if (!script.body.trim()) return toast("Add your script before mapping its delivery.");
    setCoaching(true);
    try {
      const response = await fetch("/api/delivery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        credentials: "same-origin",
        body: JSON.stringify({ script: script.body, style, audience, setting, experience }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || `Delivery analysis failed (HTTP ${response.status}).`);
      if (!result?.segments || result.segments.length === 0) throw new Error("The AI returned an empty delivery map.");
      onDeliveryMap(result as DeliveryMap);
      toast("Speak Intelligence mapped your full script.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't map this script. Please try again.");
    } finally {
      setCoaching(false);
    }
  };
  const paste = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (t) setScript({ ...script, body: t });
      else toast("Clipboard is empty.");
    } catch {
      toast("Paste was blocked — long-press inside the text box to paste instead.");
    }
  };
  const polish = async () => {
    if (!script.body.trim()) return toast("Add some text first.");
    setBusy(true);
    const before = script.body;
    let last = before;
    const r = await streamScript({ kind: "polish", text: before }, (t) => { last = t; setScript({ ...script, body: t }); }).catch(() => ({ text: "", error: "Couldn't reach the writer." }));
    setBusy(false);
    if (r.error) { toast(r.error); if (!r.text) setScript({ ...script, body: before }); }
    else if (last) toast("Polished for reading aloud");
  };
  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4 pt-[calc(env(safe-area-inset-top)+1rem)]">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-extrabold">Script</h1>
        <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground"><Check className="h-3.5 w-3.5" /> Autosaved · {words} words · ~{Math.max(1, Math.round(words / 2.5))}s</span>
      </div>
      <div className="flex gap-2">
        <select
          aria-label="Saved scripts"
          value={script.id}
          onChange={(e) => onSelectScript(e.target.value)}
          className="min-w-0 flex-1 rounded-xl bg-card px-3 py-2 text-sm font-semibold"
        >
          {scripts.map((item) => <option key={item.id} value={item.id}>{item.title || "Untitled script"}</option>)}
        </select>
        <button onClick={onNewScript} className="rounded-xl bg-secondary px-3 py-2 text-sm font-bold">New</button>
        <button onClick={onDeleteScript} disabled={scripts.length <= 1} className="rounded-xl bg-secondary px-3 py-2 text-sm font-bold text-primary disabled:opacity-40">Delete</button>
      </div>
      <input value={script.title} onChange={(e) => setScript({ ...script, title: e.target.value })} aria-label="Script title"
        className="rounded-2xl bg-card px-4 py-3 text-lg font-bold outline-none focus:ring-2 focus:ring-ring" />
      <textarea value={script.body} onChange={(e) => setScript({ ...script, body: e.target.value })} aria-label="Script text" placeholder="Type or paste your script…"
        className="min-h-[45vh] flex-1 resize-none rounded-2xl bg-card p-4 text-lg font-semibold leading-relaxed outline-none focus:ring-2 focus:ring-ring" />
      <section className="space-y-3 rounded-2xl border border-border bg-card p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-extrabold">Speak Intelligence</h2>
            <p className="text-xs text-muted-foreground">Map natural phrase groups and delivery cues across the whole script.</p>
          </div>
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <label className="block space-y-1">
          <span className="text-xs font-semibold text-muted-foreground">Speech type</span>
          <select value={style} onChange={(e) => { setStyle(e.target.value as DeliveryStyle); onDeliveryMap(null); }} className="w-full rounded-xl bg-background px-3 py-2 text-sm">
            {DELIVERY_STYLES.map((item) => <option key={item} value={item}>{DELIVERY_STYLE_LABELS[item]}</option>)}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-semibold text-muted-foreground">Audience</span>
          <input value={audience} onChange={(e) => { setAudience(e.target.value); onDeliveryMap(null); }} maxLength={100} className="w-full rounded-xl bg-background px-3 py-2 text-sm" placeholder="e.g. First-time viewers" />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="text-xs font-semibold text-muted-foreground">Setting</span>
            <select value={setting} onChange={(e) => { setSetting(e.target.value); onDeliveryMap(null); }} className="w-full rounded-xl bg-background px-2 py-2 text-xs">
              {["Camera / phone video", "Small room", "Classroom", "Church / auditorium", "Large stage", "Interview"].map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold text-muted-foreground">Experience</span>
            <select value={experience} onChange={(e) => { setExperience(e.target.value as typeof experience); onDeliveryMap(null); }} className="w-full rounded-xl bg-background px-2 py-2 text-xs">
              <option value="beginner">Beginner</option>
              <option value="comfortable">Comfortable</option>
              <option value="experienced">Experienced</option>
            </select>
          </label>
        </div>
        <button onClick={coachDelivery} disabled={coaching || !script.body.trim()} className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 font-extrabold text-primary-foreground disabled:opacity-50">
          <Sparkles className="h-4 w-4" /> {coaching ? "Analysing full script…" : deliveryMap ? "Re-map delivery" : "Map my delivery"}
        </button>
        {deliveryMap && <p className="text-xs font-semibold text-emerald-600">Delivery map ready · {deliveryMap.segments.length} speaking groups · word coverage verified</p>}
      </section>
      <div className="grid grid-cols-3 gap-2">
        <Action onClick={paste} icon={<ClipboardPaste className="h-4 w-4" />}>Paste</Action>
        <Action onClick={onWrite} icon={<Sparkles className="h-4 w-4" />}>AI Writer</Action>
        <Action onClick={polish} disabled={busy} icon={<Wand2 className="h-4 w-4" />}>{busy ? "Polishing…" : "Polish"}</Action>
      </div>
    </div>
  );
}
function Action({ children, icon, onClick, disabled }: { children: React.ReactNode; icon: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="flex items-center justify-center gap-1.5 rounded-full bg-secondary py-3 text-sm font-bold disabled:opacity-50">
      {icon}{children}
    </button>
  );
}

/* ---------------- Write ---------------- */
const TONES = ["Friendly", "Confident", "Calm", "Playful"];
const LENGTHS = [["30s", "30 sec"], ["60s", "60 sec"], ["2m", "2 min"]] as const;
function Writer({ onStream, onStart }: { onStream: (t: string) => void; onStart: (topic: string) => void }) {
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState("Friendly");
  const [length, setLength] = useState<"30s" | "60s" | "2m">("60s");
  const go = async () => {
    if (!topic.trim()) return toast("Tell the writer what the video is about.");
    onStart(topic.trim());
    const r = await streamScript({ kind: "write", topic, tone, length }, onStream).catch(() => ({ text: "", error: "Couldn't reach the writer." }));
    if (r.error) toast(r.error);
    else toast("Script ready — tap Film to read it");
  };
  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-4 pt-[calc(env(safe-area-inset-top)+1rem)]">
      <div>
        <h1 className="text-2xl font-extrabold">AI Script Writer</h1>
        <p className="text-sm font-medium text-muted-foreground">A quick draft, streamed straight into your editor.</p>
      </div>
      <label className="space-y-2">
        <span className="text-xs font-medium text-muted-foreground">Topic</span>
        <textarea value={topic} onChange={(e) => setTopic(e.target.value)} rows={3} placeholder="e.g. Three ways to keep herbs fresh all week"
          className="w-full resize-none rounded-2xl bg-card p-4 text-base font-semibold outline-none focus:ring-2 focus:ring-ring" />
      </label>
      <Chips label="Tone" options={TONES.map((t) => [t, t] as const)} value={tone} onChange={setTone} />
      <Chips label="Length" options={LENGTHS} value={length} onChange={(v) => setLength(v as typeof length)} />
      <button onClick={go} className="mt-auto flex items-center justify-center gap-2 rounded-full bg-primary py-4 text-base font-extrabold text-primary-foreground">
        <Sparkles className="h-5 w-5" /> Write my script
      </button>
    </div>
  );
}
function Chips({ label, options, value, onChange }: { label: string; options: readonly (readonly [string, string])[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map(([v, l]) => (
          <button key={v} onClick={() => onChange(v)} className={`rounded-full px-4 py-2 text-sm font-bold ${value === v ? "bg-accent text-accent-foreground" : "bg-secondary"}`}>{l}</button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Takes ---------------- */
function download(r: Recording) {
  const url = URL.createObjectURL(r.blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${r.title.replace(/[^\w\- ]+/g, "").trim() || "take"}.${extFor(r.format)}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function Takes({ takes, refresh, onOpen }: { takes: Recording[]; refresh: () => void; onOpen: (r: Recording) => void }) {
  return (
    <div className="h-full overflow-y-auto p-4 pt-[calc(env(safe-area-inset-top)+1rem)]">
      <h1 className="text-2xl font-extrabold">My Recordings</h1>
      <p className="mb-4 text-sm font-medium text-muted-foreground">Saved on this phone only.</p>
      {takes.length === 0 ? (
        <div className="rounded-3xl bg-card p-8 text-center text-sm text-muted-foreground">
          <Film className="mx-auto mb-3 h-8 w-8" />No takes yet. Record one on the Film tab and tap Save.
        </div>
      ) : (
        <ul className="space-y-3">
          {takes.map((t) => (
            <li key={t.id} className="flex items-center gap-3 rounded-3xl bg-card p-3">
              <button onClick={() => onOpen(t)} className="relative h-20 w-14 shrink-0 overflow-hidden rounded-xl bg-muted" aria-label={`Play ${t.title}`}>
                {t.thumbnail && <img src={t.thumbnail} alt="" className="h-full w-full object-cover" />}
                <Play className="absolute inset-0 m-auto h-5 w-5" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{t.title}</p>
                <p className="text-xs font-medium text-muted-foreground">{new Date(t.createdAt).toLocaleString()} · {fmtTime(t.duration)} · {extFor(t.format).toUpperCase()}</p>
              </div>
              <button aria-label="Download" onClick={() => download(t)} className="rounded-full bg-secondary p-2.5"><Download className="h-4 w-4" /></button>
              <button aria-label="Delete" onClick={async () => { if (confirm("Delete this take?")) { await deleteRecording(t.id); refresh(); } }} className="rounded-full bg-secondary p-2.5 text-primary"><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------------- Sheets ---------------- */
function Sheet({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-scrim backdrop-blur-sm" onClick={onClose}>
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-[2rem] bg-card p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-extrabold">{title}</h2>
          <button aria-label="Close" onClick={onClose} className="rounded-full bg-secondary p-2"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Review({ rec, onClose, onSaved }: { rec: Recording; onClose: () => void; onSaved: (r: Recording) => void }) {
  const url = useMemo(() => URL.createObjectURL(rec.blob), [rec.blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const share = async () => {
    const file = new File([rec.blob], `take.${extFor(rec.format)}`, { type: rec.format.split(";")[0] });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: rec.title }); } catch { /* cancelled */ }
    } else toast("Sharing files isn't supported here — use Download instead.");
  };
  return (
    <Sheet title={rec.saved ? rec.title : "Take captured"} onClose={onClose}>
      <p className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Check className="h-4 w-4 text-accent" /> {fmtTime(rec.duration)} · {extFor(rec.format).toUpperCase()} · {(rec.blob.size / 1e6).toFixed(1)} MB
      </p>
      <video src={url} controls playsInline autoPlay className="mx-auto max-h-[52vh] w-full rounded-2xl bg-background" />
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Action onClick={() => download(rec)} icon={<Download className="h-4 w-4" />}>Download</Action>
        <Action onClick={share} icon={<Share2 className="h-4 w-4" />}>Share</Action>
        {rec.saved ? (
          <Action onClick={onClose} disabled icon={<Check className="h-4 w-4" />}>Saved</Action>
        ) : (
          <button onClick={() => onSaved(rec)} className="rounded-full bg-primary py-3 text-sm font-bold text-primary-foreground">Save</button>
        )}
      </div>
    </Sheet>
  );
}

function AudioHelp({ onClose }: { onClose: () => void }) {
  const tips = [
    ["iPhone Mic Mode", "While recording, swipe down for Control Center → Mic Mode. Choose Standard for natural sound or Voice Isolation to cut background noise."],
    ["Voice Isolation", "Great in kitchens and streets. Avoid it when music or a second voice should be heard."],
    ["Android", "Turn on noise reduction in your browser's site settings if offered, and close other apps using the mic."],
    ["Distance", "Hold the phone at arm's length, about 30–50 cm. Closer sounds boomy; farther sounds echoey."],
    ["Voice following", "Needs microphone access and a browser with speech recognition (Chrome, Safari). If it stops, auto scroll takes over."],
    ["Storage", "Takes are saved only in this browser. Clearing site data removes them — download anything you want to keep."],
  ];
  return (
    <Sheet title="Cleaner phone audio" onClose={onClose}>
      <ul className="space-y-3">
        {tips.map(([t, b]) => (
          <li key={t} className="rounded-2xl bg-secondary p-4">
            <p className="font-bold">{t}</p>
            <p className="text-sm text-muted-foreground">{b}</p>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
