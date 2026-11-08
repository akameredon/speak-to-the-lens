import { useCallback, useEffect, useRef, useState } from "react";

type Rec = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

export function speechSupported() {
  if (typeof window === "undefined") return false;
  const w = window as unknown as Record<string, unknown>;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

/** Continuous recognition that restarts itself; reports phrases and terminal failures. */
export function useSpeech(onPhrase: (text: string) => void, onFail: (reason: string) => void) {
  const recRef = useRef<Rec | null>(null);
  const wantRef = useRef(false);
  const [listening, setListening] = useState(false);
  const phraseRef = useRef(onPhrase);
  const failRef = useRef(onFail);
  phraseRef.current = onPhrase;
  failRef.current = onFail;

  const stop = useCallback(() => {
    wantRef.current = false;
    recRef.current?.abort();
    recRef.current = null;
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const w = window as unknown as Record<string, new () => Rec>;
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) {
      failRef.current("unsupported");
      return;
    }
    wantRef.current = true;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || "en-US";
    rec.onresult = (e) => {
      const r = e.results[e.results.length - 1];
      if (r && r[0]) phraseRef.current(r[0].transcript);
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      wantRef.current = false;
      setListening(false);
      failRef.current(e.error);
    };
    rec.onend = () => {
      if (wantRef.current) {
        try {
          rec.start();
        } catch {
          setListening(false);
        }
      } else setListening(false);
    };
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      failRef.current("start-failed");
    }
  }, []);

  useEffect(() => stop, [stop]);
  return { start, stop, listening };
}
