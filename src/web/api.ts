let accessToken = '';
export function setAccessToken(token: string) {
  accessToken = token;
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    },
    signal: AbortSignal.timeout(15000),
  });
  const value = await response.json();
  if (!response.ok)
    throw new Error(value.error?.message || 'The service could not complete this request.');
  return value as T;
}
export async function downloadEvidence(id: string) {
  const evidence = await api<unknown>(`/api/scans/${id}/export`);
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(evidence, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `trace-${id}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
