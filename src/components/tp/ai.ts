export async function streamScript(
  body: { kind: "write"; topic: string; tone: string; length: "30s" | "60s" | "2m" } | { kind: "polish"; text: string },
  onText: (full: string) => void,
  signal?: AbortSignal,
): Promise<{ text: string; error?: string }> {
  let res: Response;
  try {
    res = await fetch("/api/script", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
      cache: "no-store",
      credentials: "same-origin",
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { text: "", error: `Could not connect to /api/script: ${detail}` };
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { text: "", error: detail || `AI request failed (HTTP ${res.status}).` };
  }
  if (!res.body) return { text: "", error: "The AI endpoint returned no response stream." };

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let full = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      full += dec.decode(value, { stream: true });
      const i = full.indexOf("[[ERROR]]");
      if (i >= 0) {
        const partial = full.slice(0, i).trim();
        return { text: partial, error: full.slice(i + 9).trim() || "The AI stream was interrupted." };
      }
      onText(full.trimStart());
    }
    full += dec.decode();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { text: full.trim(), error: `The AI response stream was interrupted: ${detail}` };
  } finally {
    reader.releaseLock();
  }

  if (!full.trim()) return { text: "", error: "Groq returned an empty response. Please try again." };
  onText(full.trim());
  return { text: full.trim() };
}
