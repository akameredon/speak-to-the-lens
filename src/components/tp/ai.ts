export async function streamScript(
  body: { kind: "write"; topic: string; tone: string; length: "30s" | "60s" | "2m" } | { kind: "polish"; text: string },
  onText: (full: string) => void,
  signal?: AbortSignal,
): Promise<{ text: string; error?: string }> {
  const res = await fetch("/api/script", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) return { text: "", error: (await res.text()) || "The writer is unavailable." };
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let full = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    full += dec.decode(value, { stream: true });
    const i = full.indexOf("[[ERROR]]");
    if (i >= 0) return { text: full.slice(0, i).trim(), error: full.slice(i + 9) };
    onText(full.trimStart());
  }
  return { text: full.trim() };
}
