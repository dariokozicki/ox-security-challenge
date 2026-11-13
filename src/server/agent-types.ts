export type AgentRequest = {
  instructions: string;
  input: unknown;
  schema: Record<string, unknown>;
  research: boolean;
};
export type AgentResponse = {
  data: unknown;
  searched: boolean;
  provider: string;
  referenceProvenance: 'provider_retrieved' | 'model_reported';
  urls: string[];
};
export type AgentRunner = (request: AgentRequest, signal?: AbortSignal) => Promise<AgentResponse>;
export type LocalProcessOptions = {
  cwd: string;
  env: NodeJS.ProcessEnv;
  input?: string;
  captureStderr?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
};
