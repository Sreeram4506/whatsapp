import Anthropic from "@anthropic-ai/sdk";
import { config } from "../../config";
import { logger } from "../../lib/logger";

/**
 * Provider abstraction. The application talks to `AiProvider` only, so a deployment can switch
 * between Claude (Anthropic SDK), any OpenAI-compatible endpoint, or no model at all (rule-based
 * demo mode) with environment variables — no code changes.
 */
export interface CompletionRequest {
  system: string;
  prompt: string;
  maxTokens?: number;
  /** Optional JSON schema — the provider must return a JSON string matching it. */
  jsonSchema?: Record<string, unknown>;
}

export interface AiProvider {
  readonly id: "anthropic" | "openai-compatible" | "rules";
  readonly label: string;
  readonly live: boolean;
  complete(req: CompletionRequest): Promise<string>;
}

export class AiUnavailableError extends Error {}

class AnthropicProvider implements AiProvider {
  readonly id = "anthropic" as const;
  readonly live = true;
  private client: Anthropic;
  constructor(private model: string) {
    this.client = new Anthropic({
      apiKey: config.ANTHROPIC_API_KEY || undefined,
      timeout: config.AI_TIMEOUT_MS,
      maxRetries: 2,
    });
  }
  get label() {
    return `Anthropic Claude (${this.model})`;
  }
  async complete(req: CompletionRequest): Promise<string> {
    try {
      const response = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: req.maxTokens ?? 4000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: {
          effort: config.AI_EFFORT,
          ...(req.jsonSchema ? { format: { type: "json_schema", schema: req.jsonSchema } } : {}),
        },
        system: req.system,
        messages: [{ role: "user", content: req.prompt }],
      });
      if (response.stop_reason === "refusal") {
        throw new AiUnavailableError(`Model declined the request (${response.stop_details?.category ?? "unspecified"})`);
      }
      const text = response.content
        .map((b) => (b.type === "text" ? b.text : ""))
        .join("")
        .trim();
      if (!text) throw new AiUnavailableError("Empty model response");
      return text;
    } catch (err) {
      if (err instanceof AiUnavailableError) throw err;
      if (err instanceof Anthropic.AuthenticationError) {
        logger.error("Anthropic authentication failed — check ANTHROPIC_API_KEY");
      } else if (err instanceof Anthropic.RateLimitError) {
        logger.warn("Anthropic rate limit reached");
      } else if (err instanceof Anthropic.APIError) {
        logger.warn({ status: err.status }, "Anthropic API error");
      } else {
        logger.warn({ err }, "Anthropic request failed");
      }
      throw new AiUnavailableError("AI provider request failed");
    }
  }
}

/** Any service exposing an OpenAI-style /chat/completions endpoint (self-hosted or third-party). */
class OpenAiCompatibleProvider implements AiProvider {
  readonly id = "openai-compatible" as const;
  readonly live = true;
  constructor(private baseUrl: string, private apiKey: string, private model: string) {}
  get label() {
    return `OpenAI-compatible endpoint (${this.model})`;
  }
  async complete(req: CompletionRequest): Promise<string> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), config.AI_TIMEOUT_MS);
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        signal: ctrl.signal,
        headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: this.model,
          max_tokens: req.maxTokens ?? 4000,
          messages: [
            { role: "system", content: req.system + (req.jsonSchema ? "\nRespond with JSON only." : "") },
            { role: "user", content: req.prompt },
          ],
          ...(req.jsonSchema ? { response_format: { type: "json_object" } } : {}),
        }),
      });
      if (!res.ok) throw new AiUnavailableError(`Provider returned HTTP ${res.status}`);
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = data.choices?.[0]?.message?.content?.trim();
      if (!text) throw new AiUnavailableError("Empty model response");
      return text;
    } catch (err) {
      logger.warn({ err: (err as Error).message }, "OpenAI-compatible request failed");
      throw err instanceof AiUnavailableError ? err : new AiUnavailableError("AI provider request failed");
    } finally {
      clearTimeout(timer);
    }
  }
}

class RulesOnlyProvider implements AiProvider {
  readonly id = "rules" as const;
  readonly live = false;
  readonly label = "Rule-based demo mode (no AI model configured)";
  async complete(): Promise<string> {
    throw new AiUnavailableError("No AI provider configured");
  }
}

let cached: AiProvider | null = null;

export function getProvider(): AiProvider {
  if (cached) return cached;
  if (config.AI_PROVIDER === "anthropic" && config.ANTHROPIC_API_KEY) {
    cached = new AnthropicProvider(config.ANTHROPIC_MODEL);
  } else if (
    config.AI_PROVIDER === "openai-compatible" &&
    config.OPENAI_COMPAT_BASE_URL &&
    config.OPENAI_COMPAT_MODEL
  ) {
    cached = new OpenAiCompatibleProvider(
      config.OPENAI_COMPAT_BASE_URL,
      config.OPENAI_COMPAT_API_KEY,
      config.OPENAI_COMPAT_MODEL,
    );
  } else {
    cached = new RulesOnlyProvider();
  }
  return cached;
}

/** Test hook */
export function setProviderForTests(p: AiProvider | null) {
  cached = p;
}
