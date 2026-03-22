export const formatTokenCount = (count: number): string => {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toLocaleString();
};

export const formatTokenDetail = (count: number): string => {
  return count.toLocaleString();
};

// USD per million tokens (input, output)
const MODEL_PRICING: Record<string, [number, number]> = {
  'opus-4-6': [5, 25],
  'opus-4-5': [5, 25],
  'opus-4-1': [15, 75],
  'opus-4': [15, 75],
  'sonnet-4-6': [3, 15],
  'sonnet-4-5': [3, 15],
  'sonnet-4': [3, 15],
  'sonnet-3-7': [3, 15],
  'haiku-4-5': [1, 5],
  'haiku-3-5': [0.8, 4],
  'haiku-3': [0.25, 1.25],
  'opus-3': [15, 75],
};

const extractModelKey = (modelId: string): string | null => {
  const match = modelId.match(/claude-(\w+-[\d-]+?)(?:-\d{8})?$/);
  return match ? match[1] : null;
};

export const calculateCost = (
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  cacheCreationTokens: number,
  cacheReadTokens: number,
): number | null => {
  const key = extractModelKey(modelId);
  const pricing = key ? MODEL_PRICING[key] : null;
  if (!pricing) return null;

  const [inputPrice, outputPrice] = pricing;
  const mtok = 1_000_000;
  return (
    (inputTokens / mtok) * inputPrice +
    (cacheCreationTokens / mtok) * inputPrice * 1.25 +
    (cacheReadTokens / mtok) * inputPrice * 0.1 +
    (outputTokens / mtok) * outputPrice
  );
};

export const formatCost = (cost: number): string => {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  if (cost >= 1_000) return `$${cost.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  return `$${cost.toFixed(2)}`;
};
