import { config } from "../../config";
import { logger } from "../../lib/logger";

/**
 * Speech-to-text integration point for Telugu/English voice notes.
 * Configure STT_PROVIDER=openai-compatible with an endpoint that implements
 * POST {STT_BASE_URL}/audio/transcriptions (multipart: file, model, language).
 */
export function sttConfigured() {
  return config.STT_PROVIDER === "openai-compatible" && !!config.STT_BASE_URL && !!config.STT_MODEL;
}

export async function transcribe(audio: Buffer, mime: string, languageHint: "te" | "en"): Promise<string | null> {
  if (!sttConfigured()) return null;
  try {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(audio)], { type: mime }), `voice.${mime.split("/")[1] ?? "ogg"}`);
    form.append("model", config.STT_MODEL);
    form.append("language", languageHint);
    const res = await fetch(`${config.STT_BASE_URL.replace(/\/$/, "")}/audio/transcriptions`, {
      method: "POST",
      headers: config.STT_API_KEY ? { authorization: `Bearer ${config.STT_API_KEY}` } : {},
      body: form,
      signal: AbortSignal.timeout(config.AI_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { text?: string };
    return data.text?.trim() || null;
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "Speech-to-text failed");
    return null;
  }
}
