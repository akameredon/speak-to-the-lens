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
const PROVIDER = "Groq";
const MODEL = "openai/gpt-oss-20b";

export const Route = createFileRoute("/api/script")({
  server: {
    handlers: {
      GET: async () =>
        Response.json(
          { ok: true, provider: PROVIDER, model: MODEL, apiKeyConfigured: Boolean(process.env.GROQ_API_KEY) },
          { headers: { "Cache-Control": "no-store" } },
        ),
      POST: async ({ request }) => {
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response("Invalid request", { status: 400 });

        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
          return new Response("AI is not configured. Add GROQ_API_KEY in Vercel project settings.", { status: 503 });
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
          upstream = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: MODEL,
              stream: true,
              temperature: 0.7,
              max_completion_tokens: 2048,
              messages: [
                { role: "system", content: instructions },
                { role: "user", content: prompt },
              ],
            }),
            signal: request.signal,
          });
        } catch {
          return new Response("Groq could not be reached. Check your connection and try again.", { status: 502 });
        }

        if (!upstream.ok) {
          const status = upstream.status;
          const detail = await upstream.text().catch(() => "");
          let message =
            status === 401 || status === 403
              ? "Groq rejected the API key. Check that GROQ_API_KEY is valid."
              : status === 429
                ? "Groq's usage limit has been reached. Wait briefly and try again."
                : status >= 500
                  ? "Groq is temporarily unavailable. Please try again."
                  : "Groq could not process this request.";
          try {
            const parsedError = JSON.parse(detail);
            const providerMessage = parsedError.error?.message;
            if (typeof providerMessage === "string" && status !== 401 && status !== 403) {
              message += ` Details: ${providerMessage.slice(0, 240)}`;
            }
          } catch {
            // Keep the safe, actionable message.
          }
          return new Response(message, { status: status === 429 ? 429 : status >= 500 ? 502 : 400 });
        }

        if (!upstream.body) return new Response("Groq returned no response stream.", { status: 502 });

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
                const content = event.choices?.[0]?.delta?.content;
                if (typeof content === "string" && content) controller.enqueue(encoder.encode(content));
              } catch {
                // Ignore incomplete or malformed SSE records.
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
              controller.enqueue(encoder.encode("\n[[ERROR]]Groq interrupted the response. Please try again."));
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
