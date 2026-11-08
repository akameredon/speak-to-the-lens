import { describe, it, expect } from "vitest";
import { advance, tokenize } from "@/lib/follow";

const words = tokenize("start with one shelf. Pull everything out, then start with one shelf again");

describe("voice following", () => {
  it("moves forward when words are spoken", () => {
    expect(advance(words, 0, "start with one")).toBe(3);
  });
  it("never moves backward on a repeated phrase", () => {
    // reader is past the second "start with one"
    expect(advance(words, 13, "start with one shelf")).toBe(13);
  });
  it("matches the repeat ahead, not the earlier one", () => {
    expect(advance(words, 7, "start with one")).toBe(10);
  });
  it("stays put on unrelated speech", () => {
    expect(advance(words, 4, "banana telephone")).toBe(4);
  });
});
