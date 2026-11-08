import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import Teleprompter from "@/components/tp/Teleprompter";

const stopTrack = vi.fn();

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] }) },
  });
  Object.defineProperty(HTMLMediaElement.prototype, "srcObject", {
    configurable: true,
    writable: true,
    value: null,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("main navigation", () => {
  it("pauses the teleprompter when leaving Film and does not resume in the background", () => {
    render(<Teleprompter />);

    fireEvent.click(screen.getByRole("button", { name: "Start reading" }));
    expect(screen.getByRole("button", { name: "Pause reading" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Script" }));
    fireEvent.click(screen.getByRole("button", { name: "Film" }));

    expect(screen.getByRole("button", { name: "Start reading" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pause reading" })).not.toBeInTheDocument();
  });
});
