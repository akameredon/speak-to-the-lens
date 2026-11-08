import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import Teleprompter from "@/components/tp/Teleprompter";

const stopTrack = vi.fn();
const getUserMedia = vi.fn();

beforeEach(() => {
  localStorage.clear();
  getUserMedia.mockReset().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] });
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
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
  it("keeps camera and microphone off until the speaker explicitly enables them", async () => {
    render(<Teleprompter />);
    expect(getUserMedia).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Enable camera & microphone" }));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));
  });

  it("keeps a clear accessible active state across the four product screens", () => {
    render(<Teleprompter />);
    const film = screen.getByRole("button", { name: "Film" });
    expect(film).toHaveAttribute("aria-current", "page");

    fireEvent.click(screen.getByRole("button", { name: "Script" }));
    expect(screen.getByRole("heading", { name: "Script" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Script" })).toHaveAttribute("aria-current", "page");
    expect(document.querySelector(".app-page")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Write" }));
    expect(screen.getByRole("heading", { name: "AI Script Writer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Write" })).toHaveAttribute("aria-current", "page");

    fireEvent.click(screen.getByRole("button", { name: "Takes" }));
    expect(screen.getByRole("heading", { name: "My Recordings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Takes" })).toHaveAttribute("aria-current", "page");
  });

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
