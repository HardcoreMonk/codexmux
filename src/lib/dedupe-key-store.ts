export interface IDedupeKeyStore {
  remember: (key: string | null | undefined) => boolean;
  has: (key: string | null | undefined) => boolean;
  size: () => number;
}

export const createDedupeKeyStore = (maxKeys = 500): IDedupeKeyStore => {
  const seen = new Set<string>();
  const order: string[] = [];

  const remember = (key: string | null | undefined): boolean => {
    if (!key) return true;
    if (seen.has(key)) return false;

    seen.add(key);
    order.push(key);

    while (order.length > maxKeys) {
      const oldest = order.shift();
      if (oldest) seen.delete(oldest);
    }

    return true;
  };

  return {
    remember,
    has: (key) => !!key && seen.has(key),
    size: () => seen.size,
  };
};
