import dayjs from 'dayjs';

export const formatNumber = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
};

export const formatNumberWithComma = (n: number): string => n.toLocaleString();

export const formatAxisTick = (value: number): string => formatNumber(value);

export const formatDuration = (ms: number): string => {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  if (hours < 24) return `${hours}h ${remainMinutes}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
};

export const formatDate = (dateStr: string): string => {
  return dayjs(dateStr).format('MM/DD');
};

export const formatFullDate = (dateStr: string): string => {
  return dayjs(dateStr).format('YYYY-MM-DD');
};

export const getChangeRate = (current: number, previous: number): string | null => {
  if (previous === 0) return null;
  const rate = ((current - previous) / previous) * 100;
  const sign = rate >= 0 ? '+' : '';
  return `${sign}${Math.round(rate).toLocaleString()}%`;
};

export const formatCompactNumber = (n: number): string => {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
};

export const formatCostWithComma = (cost: number): string => {
  if (cost < 1) return `$${cost.toFixed(2)}`;
  const fixed = cost.toFixed(1);
  const [int, dec] = fixed.split('.');
  return `$${Number(int).toLocaleString()}.${dec}`;
};

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
