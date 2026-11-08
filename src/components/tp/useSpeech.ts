import { useCallback, useEffect, useRef, useState } from "react";

type SpeechResult = ArrayLike<{ transcript: string }> & { isFinal?: boolean };
type SpeechEvent = {
  resultIndex: number;
  results: ArrayLike<SpeechResult>;
};
type Rec = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

export function speechSupported() {
  if (typeof window === "undefined") return false;
  const w = window as unknown as Record<string, unknown>;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

/** Continuous recognition with guarded restart and an explicit failure signal. */
export function useSpeech(onPhrase: (text: string) => void, onFail: (reason: string) => void) {
  const recRef = useRef<Rec | null>(null);
  const wantRef = useRef(false);
  const restartRef = useRef<number | undefined>(undefined);
  const [listening, setListening] = useState(false);
  const phraseRef = useRef(onPhrase);
  const failRef = useRef(onFail);
  phraseRef.current = onPhrase;
  failRef.current = onFail;

  const clearRestart = useCallback(() => {
    if (restartRef.current !== undefined && typeof window !== "undefined") {
      window.clearTimeout(restartRef.current);
      restartRef.current = undefined;
    }
  }, []);

  const stop = useCallback(() => {
    wantRef.current = false;
    clearRestart();
    const active = recRef.current;
    recRef.current = null;
    try {
      active?.abort();
    } catch {
      // The recognizer may already have stopped.
    }
    setListening(false);
  }, [clearRestart]);

  const start = useCallback(() => {
    const w = window as unknown as Record<string, new () => Rec>;
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) {
      wantRef.current = false;
      setListening(false);
      failRef.current("unsupported");
      return;
    }

    clearRestart();
    try {
      recRef.current?.abort();
    } catch {
      // Replacing an old recognizer is safe even if it has already ended.
    }

    const rec = new Ctor();
    recRef.current = rec;
    wantRef.current = true;
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || "en-US";

    rec.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result?.[0]?.transcript ?? "";
        if (result?.isFinal) finalText += " " + transcript;
        else interimText += " " + transcript;
      }
      const phrase = (finalText || interimText).trim();
      if (phrase) phraseRef.current(phrase);
    };

    rec.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      wantRef.current = false;
      clearRestart();
      setListening(false);
      failRef.current(event.error || "recognition-failed");
    };

    rec.onend = () => {
      if (!wantRef.current || recRef.current !== rec) {
        setListening(false);
        return;
      }
      setListening(false);
      clearRestart();
      restartRef.current = window.setTimeout(() => {
        restartRef.current = undefined;
        if (!wantRef.current || recRef.current !== rec) return;
        try {
          rec.start();
          setListening(true);
        } catch {
          wantRef.current = false;
          setListening(false);
          failRef.current("start-failed");
        }
      }, 250);
    };

    try {
      rec.start();
      setListening(true);
    } catch {
      wantRef.current = false;
      recRef.current = null;
      setListening(false);
      failRef.current("start-failed");
    }
  }, [clearRestart]);

  useEffect(() => stop, [stop]);
  return { start, stop, listening };
}
