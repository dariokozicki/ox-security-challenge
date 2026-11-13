import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Scan } from '../shared/types';
import type { ServiceStatus, CreateScanInput } from './types';
import { api, downloadEvidence } from './api';

export function useWorkspace() {
  const client = useQueryClient();
  const [selected, setSelected] = useState<string | null>(() => {
    const value = new URLSearchParams(window.location.search).get('scan');
    return value && /^[a-f0-9-]{36}$/.test(value) ? value : null;
  });
  const [localError, setError] = useState('');
  function select(id: string | null) {
    setSelected(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('scan', id);
    else url.searchParams.delete('scan');
    window.history.replaceState({}, '', url);
  }
  const history = useQuery({
    queryKey: ['scans'],
    queryFn: () => api<{ scans: Scan[] }>('/api/scans'),
    refetchInterval: 3000,
  });
  const status = useQuery({
    queryKey: ['status'],
    queryFn: () => api<ServiceStatus>('/api/status'),
    refetchInterval: 3000,
  });
  const detail = useQuery({
    queryKey: ['scan', selected],
    enabled: !!selected,
    queryFn: () => api<{ scan: Scan }>(`/api/scans/${selected}`),
    refetchInterval: (query) =>
      ['completed', 'partial', 'failed'].includes(query.state.data?.scan.status || '')
        ? false
        : 1200,
  });
  async function refresh() {
    await client.invalidateQueries();
  }
  const create = useMutation({
    mutationFn: (input: CreateScanInput) =>
      api<{ scan: Scan }>(
        input.retryOf
          ? `/api/scans/${input.retryOf}/${input.continuation ? 'continue-dependencies' : input.recheck ? 'recheck' : 'retry'}`
          : '/api/scans',
        {
          method: 'POST',
          headers: { 'idempotency-key': input.key },
          body: JSON.stringify(
            input.retryOf ? {} : { mode: input.mode, repository: input.repository },
          ),
        },
      ),
    onSuccess: (result) => {
      client.setQueryData(['scan', result.scan.id], result);
      select(result.scan.id);
      void client.invalidateQueries({ queryKey: ['scans'] });
    },
    onError: (error) => setError(error.message),
    retry: false,
  });
  async function start(mode: 'live' | 'demo', repository?: string) {
    setError('');
    await create.mutateAsync({ mode, repository, key: crypto.randomUUID() }).catch(() => {});
  }
  const deletion = useMutation({
    mutationFn: (id: string) => api(`/api/scans/${id}`, { method: 'DELETE' }),
    onSuccess: (_result, id) => {
      select(null);
      client.removeQueries({ queryKey: ['scan', id] });
      void client.invalidateQueries({ queryKey: ['scans'] });
    },
    onError: (error) => setError(error.message),
    retry: false,
  });
  async function retry(recheck = false, continuation = false) {
    if (!detail.data) return;
    setError('');
    await create
      .mutateAsync({
        mode: detail.data.scan.mode,
        retryOf: selected || undefined,
        recheck,
        continuation,
        key: crypto.randomUUID(),
      })
      .catch(() => {});
  }
  async function download() {
    if (!selected) return;
    try {
      await downloadEvidence(selected);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Export failed.');
    }
  }
  const error =
    localError || history.error?.message || status.error?.message || detail.error?.message || '';
  return {
    scans: history.data?.scans || [],
    selected,
    select,
    scan: detail.data?.scan,
    service: status.data,
    error,
    setError,
    busy: create.isPending || deletion.isPending,
    remove: () => {
      if (selected) deletion.mutate(selected);
    },
    start,
    retry: () => retry(),
    recheck: () => retry(true),
    continueDependencies: () => retry(false, true),
    download,
    refresh,
  };
}
