import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import Teleprompter from "@/components/tp/Teleprompter";

class FakeRecognition {
  static latest: FakeRecognition | undefined;
  constructor() { FakeRecognition.latest = this; }
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

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: FakeRecognition });
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }) },
  });
  Object.defineProperty(HTMLMediaElement.prototype, "srcObject", { configurable: true, writable: true, value: null });
});

afterEach(() => {
  delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
  vi.restoreAllMocks();
});

describe("voice-follow fallback", () => {
  it("returns to persisted Tap to advance mode when browser speech recognition fails", async () => {
    render(<Teleprompter />);
    fireEvent.click(screen.getByRole("button", { name: "Tap to advance" }));
    expect(screen.getByRole("button", { name: "Voice follow · listening" })).toBeInTheDocument();

    act(() => FakeRecognition.latest?.onerror?.({ error: "not-allowed" }));

    expect(screen.getByRole("button", { name: "Tap to advance" })).toBeInTheDocument();
    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem("tp.profile") || "{}").mode).toBe("manual");
    });
  });
});
