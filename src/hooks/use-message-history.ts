import { useState, useCallback, useEffect } from 'react';
import { nanoid } from 'nanoid';
import type { IHistoryEntry } from '@/types/message-history';

interface IUseMessageHistoryOptions {
  wsId: string | undefined;
}

interface IUseMessageHistoryReturn {
  entries: IHistoryEntry[];
  isLoading: boolean;
  isError: boolean;
  fetchHistory: () => Promise<void>;
  addHistory: (message: string) => Promise<void>;
  deleteHistory: (id: string) => Promise<void>;
}

const useMessageHistory = ({ wsId }: IUseMessageHistoryOptions): IUseMessageHistoryReturn => {
  const [entries, setEntries] = useState<IHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);

  const fetchHistory = useCallback(async () => {
    if (!wsId) return;
    setIsLoading(true);
    setIsError(false);
    try {
      const res = await fetch(`/api/message-history?wsId=${encodeURIComponent(wsId)}`);
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();
      setEntries(data.entries);
    } catch {
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  }, [wsId]);

  const addHistory = useCallback(async (message: string) => {
    if (!wsId) return;
    const trimmed = message.trim();
    if (!trimmed || trimmed.startsWith('/')) return;

    const tempId = `temp-${nanoid()}`;
    const tempEntry: IHistoryEntry = {
      id: tempId,
      message: trimmed,
      sentAt: new Date().toISOString(),
    };

    setEntries((prev) => {
      const filtered = prev.filter((e) => e.message !== trimmed);
      const next = [tempEntry, ...filtered];
      return next.length > 500 ? next.slice(0, 500) : next;
    });

    try {
      const res = await fetch('/api/message-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wsId, message: trimmed }),
      });
      if (res.ok) {
        const data = await res.json();
        setEntries((prev) => prev.map((e) => (e.id === tempId ? data.entry : e)));
      }
    } catch {
      // fire-and-forget
    }
  }, [wsId]);

  const deleteHistory = useCallback(async (id: string) => {
    if (!wsId) return;

    let backup: IHistoryEntry[] = [];
    setEntries((prev) => {
      backup = prev;
      return prev.filter((e) => e.id !== id);
    });

    try {
      const res = await fetch('/api/message-history', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wsId, id }),
      });
      if (!res.ok) throw new Error('delete failed');
    } catch {
      setEntries(backup);
    }
  }, [wsId]);

  useEffect(() => {
    if (wsId) fetchHistory();
  }, [wsId, fetchHistory]);

  return { entries, isLoading, isError, fetchHistory, addHistory, deleteHistory };
};

export default useMessageHistory;
