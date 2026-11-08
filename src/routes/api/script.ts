import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("write"),
    topic: z.string().trim().min(1).max(500),
    tone: z.string().trim().max(60).optional(),
    length: z.enum(["30s", "60s", "2m"]).optional(),
  }),
  z.object({
    kind: z.literal("polish"),
    text: z.string().trim().min(1).max(8000),
  }),
]);

const WORDS = { "30s": 75, "60s": 150, "2m": 300 } as const;
const MODEL = "gemini-3.8-flash";

export const Route = createFileRoute("/api/script")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response("Invalid request", { status: 400 });

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
          return new Response("AI is not configured. Add GEMINI_API_KEY in Vercel project settings.", {
            status: 503,
          });
        }

        const d = parsed.data;
        const instructions =
          "You write teleprompter scripts for solo creators filming short spoken phone videos. Output only the script text as plain spoken prose: no title, no headings, no stage directions, no emojis, no markdown. Use short sentences that are easy to read aloud.";
        const prompt =
          d.kind === "write"
            ? `Write a script about: ${d.topic}. Tone: ${d.tone || "friendly"}. Length: about ${WORDS[d.length || "60s"]} words.`
            : `Polish this script for reading aloud. Keep its meaning and roughly its length, simplify wording and break long sentences:\n\n${d.text}`;

        let upstream: Response;
        try {
          upstream = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?alt=sse`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": apiKey,
              },
              body: JSON.stringify({
                systemInstruction: { parts: [{ text: instructions }] },
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
              }),
              signal: request.signal,
            },
          );
        } catch {
          return new Response("Gemini could not be reached. Check your connection and try again.", {
            status: 502,
          });
        }

        if (!upstream.ok) {
          const status = upstream.status;
          const message =
            status === 429
              ? "Gemini's free usage limit has been reached for now. Please try again later."
              : status === 400 || status === 403
                ? "Gemini rejected the request or API key. Check that the key is valid and the Gemini API is enabled."
                : "Gemini is temporarily unavailable. Please try again.";
          return new Response(message, { status: status === 429 ? 429 : status >= 500 ? 502 : 400 });
        }

        if (!upstream.body) {
          return new Response("Gemini returned an empty response. Please try again.", { status: 502 });
        }

        const decoder = new TextDecoder();
        const encoder = new TextEncoder();
        const reader = upstream.body.getReader();
        const stream = new ReadableStream({
          async start(controller) {
            let pending = "";
            const sendLine = (line: string) => {
              if (!line.startsWith("data:")) return;
              const payload = line.slice(5).trim();
              if (!payload || payload === "[DONE]") return;
              try {
                const event = JSON.parse(payload);
                const parts = event.candidates?.[0]?.content?.parts ?? [];
                for (const part of parts) {
                  if (typeof part.text === "string") controller.enqueue(encoder.encode(part.text));
                }
              } catch {
                // Ignore malformed keep-alive or partial SSE records.
              }
            };

            try {
              while (true) {
                const { value, done } = await reader.read();
                pending += decoder.decode(value, { stream: !done });
                const lines = pending.split(/\r?\n/);
                pending = lines.pop() ?? "";
                for (const line of lines) sendLine(line);
                if (done) {
                  if (pending) sendLine(pending);
                  controller.close();
                  break;
                }
              }
            } catch {
              controller.enqueue(encoder.encode("\n[[ERROR]]Gemini interrupted the response. Please try again."));
              controller.close();
            } finally {
              reader.releaseLock();
            }
          },
          cancel() {
            void reader.cancel();
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
