import { AppError } from './config.js';
import { runLocalAgent } from './agent-local.js';
import { runOpenAiAgent } from './agent-openai.js';
import type { AgentRunner } from './agent-types.js';

export const runAgent: AgentRunner = (request, signal) => {
  const provider = process.env.TRACE_AI_PROVIDER || 'disabled';
  if (provider === 'codex-local') return runLocalAgent(request, signal);
  if (provider === 'openai') return runOpenAiAgent(request, signal);
  throw new AppError(
    'ai_disabled',
    'AI is not configured. Set TRACE_AI_PROVIDER=codex-local for a ChatGPT login, or explicitly select openai for paid API use.',
    503,
  );
};
