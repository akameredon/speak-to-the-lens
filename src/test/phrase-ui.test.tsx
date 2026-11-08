import { createRef, useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FilmSurface } from "@/components/tp/Teleprompter";
import { nextDeliveryPosition, previousDeliveryPosition, type DeliveryMap } from "@/lib/delivery";
import type { Profile } from "@/lib/store";

const words = "Good morning. Welcome to the team. Let’s begin.".split(/\\s+/);
const map: DeliveryMap = {
  style: "formal",
  audience: "staff",
  setting: "boardroom",
  segments: [
    { startWord: 0, endWord: 2, pace: "natural", pitch: "steady", volume: "conversational", emotion: "warm", emphasis: [], pauseAfterMs: 0, cue: "Open warmly" },
    { startWord: 2, endWord: 6, pace: "measured", pitch: "steady", volume: "projected", emotion: "confident", emphasis: [], pauseAfterMs: 300, cue: "Welcome the team" },
    { startWord: 6, endWord: 8, pace: "natural", pitch: "lift", volume: "conversational", emotion: "curious", emphasis: [], pauseAfterMs: 0, cue: "Invite attention" },
  ],
};

function Harness() {
  const [pos, setPos] = useState(0);
  const profile: Profile = { displayName: "Test", camera: "user", fontSize: 32, speed: 5, mirror: false, mode: "manual" };
  return (
    <FilmSurface
      videoRef={createRef<HTMLVideoElement>()}
      camReady
      profile={profile}
      words={words}
      deliveryMap={map}
      pos={pos}
      setPos={setPos}
      running
      activeMode="manual"
      listening={false}
      recording={false}
      elapsed={0}
      upd={() => {}}
      onToggleRead={() => {}}
      onAdvance={() => setPos((current) => nextDeliveryPosition(map, words, current))}
      onPrevious={() => setPos((current) => previousDeliveryPosition(map, words, current))}
      onRecord={() => {}}
      onEdit={() => {}}
      onHelp={() => {}}
      onSwitchMode={() => {}}
    />
  );
}

describe("phrase highlighting and advancement", () => {
  it("highlights the whole active phrase and advances one complete group per tap", () => {
    render(<Harness />);
    const active = () => document.querySelector(".word-current");

    expect(active()?.textContent?.trim()).toBe("Good morning.");
    expect(active()).toHaveAttribute("aria-current", "true");

    fireEvent.click(screen.getByRole("button", { name: /Done · Next phrase/ }));
    expect(active()?.textContent?.trim()).toBe("Welcome to the team.");

    fireEvent.click(screen.getByRole("button", { name: /Done · Next phrase/ }));
    expect(active()?.textContent?.trim()).toBe("Let’s begin.");
  });

  it("moves back to the previous complete phrase", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Done · Next phrase/ }));
    fireEvent.click(screen.getByRole("button", { name: "Previous phrase" }));
    expect(document.querySelector(".word-current")?.textContent?.trim()).toBe("Good morning.");
  });
});
