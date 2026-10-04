// Provider-agnostic contract for structured (JSON) generation. Phase 4 adds
// Gemini, DeepSeek and OpenAI adapters behind the same interface.
import Anthropic from '@anthropic-ai/sdk';

export type Effort = 'low' | 'medium' | 'high';

/** A piece of user content: plain text, a PDF, or an image. */
export type ContentPart =
  | { kind: 'text'; text: string }
  | { kind: 'pdf'; base64: string }
  | { kind: 'image'; base64: string; mediaType: 'image/png' | 'image/jpeg' | 'image/webp' };

export interface StructuredRequest {
  system: string;
  content: ContentPart[];
  schema: Record<string, unknown>;
  maxTokens: number;
  effort: Effort;
}

export interface Usage {
  tokensIn: number;
  tokensOut: number;
  cacheRead: number;
}

export type StructuredResult =
  | { ok: true; json: unknown; model: string; usage: Usage }
  | {
      ok: false;
      reason: 'refused' | 'truncated' | 'invalid_json';
      model: string;
      usage: Usage;
      detail?: string;
    };

export interface AIProvider {
  readonly name: string;
  readonly model: string;
  generate(req: StructuredRequest): Promise<StructuredResult>;
}

/** USD per million tokens: [input, output, cache read]. */
const PRICING: Record<string, [number, number, number]> = {
  'claude-opus-5-5': [4, 20, 0.2],
  'claude-sonnet-5-5': [2, 10, 0.2],
  'claude-haiku-4-5': [1, 5, 0.1],
};

export function estimateCostUsd(model: string, usage: Usage): number {
  const [i, o, c] = PRICING[model] ?? PRICING['claude-opus-5-5']!;
  return (usage.tokensIn * i + usage.tokensOut * o + usage.cacheRead * c) / 1_000_000;
}

function toAnthropicContent(parts: ContentPart[]): Anthropic.Beta.BetaContentBlockParam[] {
  return parts.map((p) => {
    switch (p.kind) {
      case 'text':
        return { type: 'text', text: p.text };
      case 'pdf':
        return {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: p.base64 },
        };
      case 'image':
        return {
          type: 'image',
          source: { type: 'base64', media_type: p.mediaType, data: p.base64 },
        };
    }
  });
}

export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    readonly model = 'claude-opus-5-5',
  ) {
    this.client = new Anthropic({ apiKey, timeout: 300_000, maxRetries: 2 });
  }

  async generate(req: StructuredRequest): Promise<StructuredResult> {
    // Streaming avoids HTTP timeouts on long job analyses; finalMessage()
    // returns the assembled response. Thinking stays adaptive (the default);
    // effort controls depth. Server-side fallback re-runs a declined request
    // on Anthropic's recommended model for that refusal category.
    const message = await this.client.beta.messages
      .stream({
        model: this.model,
        max_tokens: req.maxTokens,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: req.system,
        output_config: { effort: req.effort, format: { type: 'json_schema', schema: req.schema } },
        messages: [{ role: 'user', content: toAnthropicContent(req.content) }],
      })
      .finalMessage();

    const usage: Usage = {
      tokensIn: message.usage.input_tokens + (message.usage.cache_creation_input_tokens ?? 0),
      tokensOut: message.usage.output_tokens,
      cacheRead: message.usage.cache_read_input_tokens ?? 0,
    };
    const model = message.model;

    if (message.stop_reason === 'refusal') {
      return {
        ok: false,
        reason: 'refused',
        model,
        usage,
        detail: message.stop_details?.category ?? undefined,
      };
    }
    if (message.stop_reason === 'max_tokens') {
      return { ok: false, reason: 'truncated', model, usage };
    }
    const text = message.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    try {
      return { ok: true, json: JSON.parse(text), model, usage };
    } catch {
      return { ok: false, reason: 'invalid_json', model, usage };
    }
  }
}
