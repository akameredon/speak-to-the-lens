import { createFileRoute } from "@tanstack/react-router";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { z } from "zod";

const Body = z.object({
  kind: z.enum(["write", "polish"]),
  topic: z.string().max(500).optional(),
  tone: z.string().max(60).optional(),
  length: z.enum(["30s", "60s", "2m"]).optional(),
  text: z.string().max(8000).optional(),
});

const WORDS = { "30s": 75, "60s": 150, "2m": 300 } as const;

export const Route = createFileRoute("/api/script")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response("Invalid request", { status: 400 });
        const d = parsed.data;
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) return new Response("AI is not configured", { status: 500 });

        let runId = request.headers.get("X-Lovable-AIG-Run-ID")?.trim() || undefined;
        const provider = createOpenAI({
          baseURL: "https://ai.gateway.lovable.dev/v1",
          apiKey,
          headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
          fetch: async (input, init) => {
            const h = new Headers(init?.headers);
            if (runId && !h.has("X-Lovable-AIG-Run-ID")) h.set("X-Lovable-AIG-Run-ID", runId);
            const res = await fetch(input, { ...init, headers: h });
            if (res.status >= 400) lastStatus = res.status;
            runId ??= res.headers.get("X-Lovable-AIG-Run-ID")?.trim() || undefined;
            return res;
          },
        });
        let lastStatus = 0;

        const instructions =
          "You write teleprompter scripts for solo creators filming short spoken phone videos. Output only the script text as plain spoken prose: no title, no headings, no stage directions, no emojis, no markdown. Use short sentences that are easy to read aloud.";
        const prompt =
          d.kind === "write"
            ? `Write a script about: ${d.topic}. Tone: ${d.tone || "friendly"}. Length: about ${WORDS[d.length || "60s"]} words.`
            : `Polish this script for reading aloud. Keep its meaning and roughly its length, simplify wording and break long sentences:\n\n${d.text}`;

        const result = streamText({
          model: provider.responses("openai/gpt-6-astra"),
          instructions,
          prompt,
          abortSignal: request.signal,
          providerOptions: {
            openai: {
              store: false,
              forceReasoning: true,
              reasoningEffort: "low",
              reasoningSummary: "auto",
              include: ["reasoning.encrypted_content"],
            },
          },
        });

        const enc = new TextEncoder();
        const stream = new ReadableStream({
          async start(c) {
            try {
              for await (const chunk of result.textStream) c.enqueue(enc.encode(chunk));
              c.close();
            } catch (e) {
              const msg =
                lastStatus === 402
                  ? "AI credits have run out. Add credits to keep writing."
                  : lastStatus === 429
                    ? "Too many requests right now. Try again in a moment."
                    : "The writer couldn't finish. Please try again.";
              c.enqueue(enc.encode(`\n[[ERROR]]${msg}`));
              c.close();
            }
          },
        });
        return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
      },
    },
  },
});
