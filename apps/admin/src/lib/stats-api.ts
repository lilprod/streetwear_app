import type { StatsSummary } from '@streetwear/shared';
import { api } from './api';

export type StatsFilters = { from?: string; to?: string };

export const getStatsSummary = (f: StatsFilters, signal?: AbortSignal) =>
  api<StatsSummary>('/admin/stats/summary', { query: { ...f }, signal });
