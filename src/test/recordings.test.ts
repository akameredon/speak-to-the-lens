import { beforeEach, describe, expect, it, vi } from "vitest";

const { db } = vi.hoisted(() => ({ db: new Map<string, unknown>() }));

vi.mock("idb-keyval", () => ({
  get: async (key: string) => db.get(key),
  set: async (key: string, value: unknown) => { db.set(key, value); },
  del: async (key: string) => { db.delete(key); },
  keys: async () => Array.from(db.keys()),
}));

import { deleteRecording, extFor, listRecordings, pickMime, putRecording, type Recording } from "@/lib/store";

beforeEach(() => db.clear());

function recording(id: string, blob = new Blob(["video-bytes"], { type: "video/webm" })): Recording {
  return {
    id,
    title: `Take ${id}`,
    createdAt: 1,
    duration: 2,
    blob,
    format: "video/webm",
    saved: true,
  };
}

describe("on-device recording storage", () => {
  it("writes and verifies a recording before reporting it saved", async () => {
    const item = recording("one");
    await expect(putRecording(item)).resolves.toBeUndefined();
    const saved = await listRecordings();
    expect(saved).toHaveLength(1);
    expect(saved[0].blob.size).toBe(item.blob.size);
    expect(saved[0].blob.type).toBe("video/webm");
  });

  it("refuses to save empty video data", async () => {
    await expect(putRecording(recording("empty", new Blob([], { type: "video/webm" })))).rejects.toThrow("non-empty");
    expect(await listRecordings()).toHaveLength(0);
  });

  it("deletes only the selected take", async () => {
    await putRecording(recording("one"));
    await putRecording(recording("two"));
    await deleteRecording("one");
    expect((await listRecordings()).map((item) => item.id)).toEqual(["two"]);
  });

  it("chooses a browser-supported recording format and a matching extension", () => {
    expect(extFor("video/mp4;codecs=avc1")).toBe("mp4");
    expect(extFor("video/webm;codecs=vp9")).toBe("webm");
    expect(typeof pickMime()).toBe("string");
  });
});
