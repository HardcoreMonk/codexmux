export const cleanApprovalOptionLabel = (label: string): string =>
  label.replace(/^\d+\.\s+/, '').trim();

export const hasUsableApprovalOptions = (options: string[]): boolean =>
  options.some((option) => option.trim().length > 0);

export const getApprovalQueueFallbackText = (input: {
  lastUserMessage?: string | null;
  tabName: string;
}): string => {
  const prompt = input.lastUserMessage?.trim();
  return prompt || input.tabName;
};
