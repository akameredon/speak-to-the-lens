import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSpeech } from "@/components/tp/useSpeech";

class FakeRecognition {
  constructor() { latestRecognition = this; }
  continuous = false;
  interimResults = false;
  lang = "";
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }> }) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();
}

afterEach(() => {
  delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
  vi.useRealTimers();
});

describe("speech recognition lifecycle", () => {
  it("starts recognition and forwards recognised text", () => {
    Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: FakeRecognition });
    const onPhrase = vi.fn();
    const onFail = vi.fn();
    const { result, unmount } = renderHook(() => useSpeech(onPhrase, onFail));
    act(() => result.current.start());
    expect(result.current.listening).toBe(true);
    const instance = latestRecognition;
    const results = [{ 0: { transcript: "hello everyone" }, isFinal: true }] as unknown as ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }>;
    act(() => instance?.onresult?.({ resultIndex: 0, results }));
    expect(onPhrase).toHaveBeenCalledWith("hello everyone");
    expect(onFail).not.toHaveBeenCalled();
    unmount();
  });

  it("reports recognition failures instead of silently changing reading mode", () => {
    Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: FakeRecognition });
    const onFail = vi.fn();
    const { result, unmount } = renderHook(() => useSpeech(vi.fn(), onFail));
    act(() => result.current.start());
    // The hook's active recognizer is intentionally private; dispatch the error through
    // the fake constructor's latest instance to exercise the browser callback.
    const instance = latestRecognition;
    act(() => instance?.onerror?.({ error: "not-allowed" }));
    expect(onFail).toHaveBeenCalledWith("not-allowed");
    expect(result.current.listening).toBe(false);
    unmount();
  });
});

let latestRecognition: FakeRecognition | undefined;
