import dayjs from 'dayjs';

export const formatNumber = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
};

export const formatDuration = (ms: number): string => {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  if (hours < 24) return `${hours}시간 ${remainMinutes}분`;
  const days = Math.floor(hours / 24);
  return `${days}일 ${hours % 24}시간`;
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
  return `${sign}${rate.toFixed(0)}%`;
};

export const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
