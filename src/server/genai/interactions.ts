import 'server-only';
import { z } from 'zod';

import { classifyGenAiError, GenAiError } from './errors';
import type { GoogleGenAI } from './client';
import type { ModelId, ThinkingLevel } from './models';

/**
 * The single place a Gemini request is shaped.
 *
 * Written against the Interactions API (`ai.interactions.create`), Gemini's default
 * surface since June 2026. `generateContent` is legacy and CI fails if it appears
 * anywhere in this repository.
 *
 * The request shape here was read from `@google/genai`'s own type declarations rather
 * than from documentation, which matters in one specific way: `thinking_level` lives
 * inside `generation_config`, not at the top level where a reasonable person would
 * put it. Getting that wrong produces a request the API accepts and silently ignores.
 */

/** A stable, large prefix — the document. Sent first so implicit caching can hit. */
export interface ContextPart {
  readonly kind: 'text' | 'pdf';
  readonly text?: string;
  readonly base64?: string;
}

export interface StructuredRequest<TSchema extends z.ZodType> {
  readonly model: ModelId;
  readonly schema: TSchema;
  readonly system: string;
  /**
   * Large and stable. Sent FIRST, because Gemini's implicit context caching keys on a
   * shared prefix: a multi-turn session over one document reuses this for free, and
   * only if it really is a prefix.
   */
  readonly context: readonly ContextPart[];
  /** Small and varying. Always LAST, for the same reason. */
  readonly instruction: string;
  readonly thinkingLevel?: ThinkingLevel;
  readonly maxOutputTokens?: number;
}

export interface StructuredResult<TValue> {
  readonly value: TValue;
  readonly model: ModelId;
  /** Tokens served from Gemini's implicit cache, when the response reports them. */
  readonly cachedTokens: number | null;
}

/**
 * Issue a schema-constrained request and return a validated object.
 *
 * Validation happens twice over: the API is asked to constrain decoding to the JSON
 * schema, and the result is then parsed through Zod anyway. The second pass is not
 * redundant — constrained decoding guarantees shape, not that the model populated a
 * nullable field honestly, and a `safeParse` failure is a clearer signal than a
 * downstream `undefined`.
 */
export async function runStructured<TSchema extends z.ZodType>(
  client: GoogleGenAI,
  request: StructuredRequest<TSchema>,
): Promise<StructuredResult<z.infer<TSchema>>> {
  const input = [
    ...request.context.map(toInputText),
    request.instruction,
  ].join('\n\n');

  try {
    const interaction = await client.interactions.create({
      model: request.model,
      system_instruction: request.system,
      input,
      response_format: {
        type: 'text',
        mime_type: 'application/json',
        schema: z.toJSONSchema(request.schema) as Record<string, unknown>,
      },
      generation_config: {
        thinking_level: request.thinkingLevel ?? 'medium',
        ...(request.maxOutputTokens === undefined
          ? {}
          : { max_output_tokens: request.maxOutputTokens }),
      },
      stream: false,
    });

    const text = interaction.output_text;
    if (text === undefined || text.trim().length === 0) {
      throw new GenAiError('invalid_output', request.model, 'The model returned no text.');
    }

    return {
      value: parseOrThrow(request.schema, text, request.model),
      model: request.model,
      cachedTokens: readCachedTokens(interaction),
    };
  } catch (error) {
    throw classifyGenAiError(error, request.model);
  }
}

function toInputText(part: ContextPart): string {
  // Document text is wrapped in an explicit boundary so the system instruction can
  // refer to it as untrusted data. A contract is user-supplied content that may
  // contain instructions aimed at the model; see SECURITY.md.
  return `<document>\n${part.text ?? ''}\n</document>`;
}

function parseOrThrow<TSchema extends z.ZodType>(
  schema: TSchema,
  text: string,
  model: ModelId,
): z.infer<TSchema> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new GenAiError('invalid_output', model, 'The model returned text that is not JSON.', {
      cause: error,
    });
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new GenAiError(
      'invalid_output',
      model,
      `The model's response did not match the expected schema: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

/**
 * Read the implicit-cache hit count when the response reports one.
 *
 * Accessed defensively because usage reporting is the part of an SDK response most
 * likely to move between versions, and a missing counter must not fail a request that
 * otherwise succeeded.
 */
function readCachedTokens(interaction: unknown): number | null {
  if (typeof interaction !== 'object' || interaction === null) return null;
  const usage = (interaction as { usage?: { total_cached_tokens?: unknown } }).usage;
  const cached = usage?.total_cached_tokens;
  return typeof cached === 'number' ? cached : null;
}
