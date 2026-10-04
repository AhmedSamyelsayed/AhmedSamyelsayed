import type { z } from 'zod';
import type { AIProvider, StructuredRequest, Usage } from './provider.ts';

export class AIError extends Error {
  constructor(
    readonly code: 'refused' | 'truncated' | 'invalid_output',
    readonly usage: Usage,
    readonly model: string,
  ) {
    super(code);
  }
}

export interface RunResult<T> {
  data: T;
  usage: Usage;
  model: string;
}

function add(a: Usage, b: Usage): Usage {
  return {
    tokensIn: a.tokensIn + b.tokensIn,
    tokensOut: a.tokensOut + b.tokensOut,
    cacheRead: a.cacheRead + b.cacheRead,
  };
}

/**
 * Calls the provider and validates the JSON against the zod schema. Invalid
 * output gets exactly one retry (CONTEXT.md section 8); refusals and
 * truncation are not retried.
 */
export async function runStructured<T>(
  provider: AIProvider,
  req: StructuredRequest,
  schema: z.ZodType<T>,
): Promise<RunResult<T>> {
  let usage: Usage = { tokensIn: 0, tokensOut: 0, cacheRead: 0 };
  let model = provider.model;
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await provider.generate(req);
    usage = add(usage, result.usage);
    model = result.model;
    if (!result.ok) {
      if (result.reason === 'invalid_json') continue;
      throw new AIError(result.reason, usage, model);
    }
    const parsed = schema.safeParse(result.json);
    if (parsed.success) return { data: parsed.data, usage, model };
  }
  throw new AIError('invalid_output', usage, model);
}
