import { z } from 'zod';
import { boundedFetch } from './network.js';
import { AppError } from './config.js';
import { apiModel, apiRequestLimit, estimateUsage, openApiLedger } from './api-usage.js';
import type { AgentRunner } from './agent-types.js';
import type { ApiLedger } from './api-usage-types.js';
import type { Fetcher } from './types.js';
import { extractResearchInstructions, searchPhaseInstructions } from './api-prompts.js';

const Response = z.object({
  status: z.string(),
  incomplete_details: z.object({ reason: z.string() }).nullable().optional(),
  usage: z
    .object({
      input_tokens: z.number().int().nonnegative(),
      output_tokens: z.number().int().nonnegative(),
    })
    .nullable()
    .optional(),
  output: z.array(
    z.object({
      type: z.string(),
      content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
      action: z
        .object({ sources: z.array(z.object({ url: z.string() })).optional() })
        .passthrough()
        .optional(),
    }),
  ),
});
export function createOpenAiAgent(
  fetcher: Fetcher = fetch,
  ledgerFactory: () => Promise<ApiLedger> = openApiLedger,
): AgentRunner {
  return async (request, signal) => {
    const key = process.env.CHATGPT_API_KEY_OX_CHALLENGE;
    if (!key)
      throw new AppError(
        'ai_config',
        'API mode requires CHATGPT_API_KEY_OX_CHALLENGE. No credential fallback attempted.',
        503,
      );
    if (process.env.TRACE_OPENAI_MODEL && process.env.TRACE_OPENAI_MODEL !== apiModel)
      throw new AppError(
        'ai_config',
        `The cost-controlled API adapter only permits ${apiModel}.`,
        503,
      );
    const limit = apiRequestLimit();
    const ledger = await ledgerFactory();
    try {
      const send = async (input: unknown, search: boolean, structured: boolean) => {
        signal?.throwIfAborted();
        const body = JSON.stringify({
          model: apiModel,
          store: false,
          service_tier: 'default',
          max_output_tokens: request.research ? 4000 : 12000,
          reasoning: { effort: 'low' },
          instructions: search
            ? request.instructions + searchPhaseInstructions
            : request.research
              ? extractResearchInstructions
              : request.instructions,
          input: JSON.stringify(input),
          ...(search
            ? {
                tools: [{ type: 'web_search', search_context_size: 'low' }],
                tool_choice: 'required',
                max_tool_calls: 2,
                parallel_tool_calls: false,
                include: ['web_search_call.action.sources'],
              }
            : {}),
          ...(structured
            ? {
                text: {
                  format: {
                    type: 'json_schema',
                    name: 'security_review',
                    strict: true,
                    schema: request.schema,
                  },
                },
              }
            : {}),
        });
        if (Buffer.byteLength(body) > 120000)
          throw new AppError('ai_input', 'API request exceeds the 120 KB input budget.', 422);
        // Reserve durably before sending. Timeouts, crashes and HTTP errors consume the slot.
        const reservation = await ledger.reserve(limit, apiModel);
        const raw = await boundedFetch(
          'https://api.openai.com/v1/responses',
          {
            method: 'POST',
            signal,
            headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
            body,
          },
          1500000,
          fetcher,
          120000,
        );
        const response = Response.parse(JSON.parse(raw));
        if (response.usage)
          await ledger.record(
            reservation,
            estimateUsage(
              response.usage.input_tokens,
              response.usage.output_tokens,
              response.output.filter((item) => item.type === 'web_search_call').length,
            ),
          );
        if (response.status !== 'completed')
          throw new AppError(
            'ai_incomplete',
            response.incomplete_details?.reason === 'max_output_tokens'
              ? 'Source analysis reached its output limit. Reduce the review scope and try again.'
              : 'AI response was incomplete; findings could not be read.',
            502,
          );
        const text = response.output
          .flatMap((item) => item.content || [])
          .filter((item) => item.type === 'output_text')
          .map((item) => item.text || '')
          .join('\n');
        return { response, text };
      };
      const search = request.research ? await send(request.input, true, false) : undefined;
      const urls =
        search?.response.output.flatMap(
          (item) => item.action?.sources?.map((source) => source.url) || [],
        ) || [];
      const result = await send(
        search
          ? { inventory: request.input, research: search.text, allowedSourceUrls: urls }
          : request.input,
        false,
        true,
      );
      return {
        data: JSON.parse(result.text),
        searched: !!search?.response.output.some((item) => item.type === 'web_search_call'),
        provider: `OpenAI API / ${apiModel}`,
        referenceProvenance: 'provider_retrieved',
        urls,
      };
    } finally {
      await ledger.close();
    }
  };
}
export const runOpenAiAgent = createOpenAiAgent();
