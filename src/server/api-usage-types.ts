export type ApiUsage = {
  inputTokens: number;
  outputTokens: number;
  searchCalls: number;
  estimatedMicrousd: number;
};
export type ApiLedger = {
  reserve(limit: number, model: string): Promise<string>;
  record(id: string, usage: ApiUsage): Promise<void>;
  entries(): Promise<{ usage: ApiUsage | null }[]>;
  close(): Promise<void>;
};
