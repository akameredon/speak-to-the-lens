import { beforeEach, describe, expect, it } from "vitest";
import {
  createScript,
  deleteScript,
  loadCurrentScript,
  loadScripts,
  saveScript,
  setCurrentScript,
} from "@/lib/store";

beforeEach(() => localStorage.clear());

describe("on-device script library", () => {
  it("migrates the previous single-script save without losing its content", () => {
    const legacy = {
      id: "legacy-script",
      title: "My old script",
      body: "Keep this exact wording.",
      savedAt: 123,
      current: true,
    };
    localStorage.setItem("tp.script", JSON.stringify(legacy));

    expect(loadScripts()).toEqual([legacy]);
    expect(loadCurrentScript().body).toBe("Keep this exact wording.");
  });

  it("creates scripts and switches the active script", () => {
    const first = createScript("First take");
    const second = createScript("Second take");

    expect(loadScripts()).toHaveLength(3);
    expect(loadCurrentScript().id).toBe(second.id);
    expect(setCurrentScript(first.id)?.id).toBe(first.id);
    expect(loadCurrentScript().id).toBe(first.id);
  });

  it("updates a script without removing the rest of the library", () => {
    const first = createScript("First take");
    createScript("Second take");

    saveScript({ ...first, title: "Updated first take", body: "Updated words." });

    expect(loadScripts()).toHaveLength(3);
    expect(loadScripts().find((item) => item.id === first.id)?.body).toBe("Updated words.");
    expect(loadCurrentScript().id).toBe(first.id);
  });

  it("selects another script after deleting the current one", () => {
    const first = createScript("First take");
    const second = createScript("Second take");

    const selected = deleteScript(second.id);

    expect(selected.id).toBe(first.id);
    expect(loadCurrentScript().id).toBe(first.id);
    expect(loadScripts()).toHaveLength(2);
  });

  it("never deletes the final remaining script", () => {
    const only = createScript("Only script");
    localStorage.setItem("tp.scripts", JSON.stringify([only]));

    expect(deleteScript(only.id).id).toBe(only.id);
    expect(loadScripts()).toHaveLength(1);
  });
});
