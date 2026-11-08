import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { DELIVERY_STYLES, validateDeliverySegments, type DeliveryMap } from "@/lib/delivery";
import { aiRateLimitResponse, aiRequestSignal, aiRequestTooLarge, checkAiRateLimit } from "@/lib/ai-guard";

const Body = z.object({
  script: z.string().trim().min(1).max(8000),
  style: z.enum(DELIVERY_STYLES),
  audience: z.string().trim().min(1).max(100),
  setting: z.string().trim().min(1).max(100),
  experience: z.enum(["beginner", "comfortable", "experienced"]).default("beginner"),
});

const MODEL = "openai/gpt-oss-20b";

export const Route = createFileRoute("/api/delivery")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rate = checkAiRateLimit(request, "delivery", 4);
        if (!rate.allowed) return aiRateLimitResponse(rate.retryAfterSeconds);
        if (aiRequestTooLarge(request, 12_000)) return Response.json({ error: "This script is too large to analyse in one request." }, { status: 413 });
        const rawBody = await request.text().catch(() => "");
        if (new TextEncoder().encode(rawBody).byteLength > 12_000) return Response.json({ error: "This script is too large to analyse in one request." }, { status: 413 });
        let input: unknown;
        try { input = JSON.parse(rawBody); } catch { return Response.json({ error: "Invalid delivery-coaching request." }, { status: 400 }); }
        const parsed = Body.safeParse(input);
        if (!parsed.success) return Response.json({ error: "Invalid delivery-coaching request." }, { status: 400 });

        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) return Response.json({ error: "AI is not configured. Add GROQ_API_KEY in Vercel project settings." }, { status: 503 });

        const { script, style, audience, setting, experience } = parsed.data;
        const words = script.split(/\s+/).filter(Boolean);
        const system = `You are an expert speech-delivery coach. Analyse the ENTIRE script before creating a delivery map. Divide it into natural spoken thought-groups, not individual words by default and not fixed-size groups. A group can contain 1, 2, 3, 4, or more words according to syntax, meaning, breath, emphasis and emotional intent. Never rewrite, omit, duplicate, invent, reorder or paraphrase script words.

Return ONLY valid JSON in this exact shape:
{"segments":[{"startWord":0,"endWord":3,"pace":"natural","pitch":"steady","volume":"conversational","emotion":"warm","emphasis":[0],"pauseAfterMs":300,"cue":"Warm opening"}]}

Rules:
- Word indexes are zero-based; startWord is inclusive and endWord is exclusive.
- Segments must cover every word exactly once, in order, contiguously, with no gaps or overlaps.
- Group words into meaningful speaking units. Use short groups for punchy impact and longer groups for fluent thoughts. Vary group lengths naturally.
- emphasis contains zero or more absolute word indexes inside that segment. Emphasise sparingly.
- pace: slow, measured, natural, brisk.
- pitch: lower, steady, lift, fall, varied.
- volume: soft, conversational, projected.
- emotion: warm, confident, curious, reflective, urgent, joyful, serious, neutral.
- pauseAfterMs: 0 to 2500. Use 0 for no intentional pause; longer pauses only where rhetoric, breath or emotion warrants them.
- cue: short practical instruction, max 100 characters, such as "Let this thought land".
- Respect punctuation and sentence boundaries. Do not prescribe shouting. Volume is relative and safe.
- Infer the emotional journey from the full script. Do not force drama into neutral content.
- Adapt delivery to the selected style, audience, setting and experience.
- Do not add stage directions to the script; this is metadata only.`;

        let upstream: Response;
        const signal = aiRequestSignal(request);
        try {
          upstream = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
              model: MODEL,
              temperature: 0.2,
              max_completion_tokens: 4096,
              response_format: { type: "json_object" },
              messages: [
                { role: "system", content: system },
                { role: "user", content: `Selected speech style: ${style}. Audience: ${audience}. Setting: ${setting}. Speaker experience: ${experience}. The script contains exactly ${words.length} whitespace-separated words. Analyse it completely and map all words.\n\nSCRIPT:\n${script}` },
              ],
            }),
            signal,
          });
        } catch {
          return Response.json(
            { error: request.signal.aborted ? "The request was cancelled." : "The AI request timed out. Try a shorter script or try again." },
            { status: request.signal.aborted ? 499 : 504, headers: { "Cache-Control": "no-store" } },
          );
        }

        if (!upstream.ok) {
          const status = upstream.status;
          const detail = await upstream.text().catch(() => "");
          const message = status === 401 || status === 403
            ? "Groq rejected the API key. Check GROQ_API_KEY."
            : status === 429
              ? "Groq's usage limit has been reached. Wait briefly and try again."
              : status >= 500
                ? "Groq is temporarily unavailable. Please try again."
                : `Groq could not analyse this script (HTTP ${status}). ${detail.slice(0, 180)}`;
          return Response.json({ error: message }, { status: status === 429 ? 429 : status >= 500 ? 502 : 400 });
        }

        const payload = await upstream.json().catch(() => null) as { choices?: Array<{ message?: { content?: string } }> } | null;
        const content = payload?.choices?.[0]?.message?.content;
        if (typeof content !== "string") return Response.json({ error: "The AI returned no delivery map. Please try again." }, { status: 502 });

        let decoded: unknown;
        try {
          decoded = JSON.parse(content);
        } catch {
          return Response.json({ error: "The AI returned an unreadable delivery map. Please try again." }, { status: 502 });
        }

        const candidate = decoded && typeof decoded === "object" && "segments" in decoded
          ? (decoded as { segments?: unknown }).segments
          : undefined;
        const segments = validateDeliverySegments(script, candidate);
        if (!segments) {
          return Response.json({ error: "The delivery map did not match every script word exactly. Please analyse it again." }, { status: 422 });
        }

        const result: DeliveryMap = { style, audience, setting, segments };
        return Response.json(result, { headers: { "Cache-Control": "no-store" } });
      },
    },
  },
});
