import type { IAgentProvider } from '@/lib/providers/types';

const g = globalThis as unknown as { __ptAgentProviders?: Map<string, IAgentProvider> };
if (!g.__ptAgentProviders) g.__ptAgentProviders = new Map();
const providers = g.__ptAgentProviders;

export const registerProvider = (provider: IAgentProvider): void => {
  providers.set(provider.id, provider);
};

export const clearProviders = (): void => {
  providers.clear();
};

export const getProvider = (id: string): IAgentProvider | null => providers.get(id) ?? null;

export const getProviderByPanelType = (panelType: string | undefined): IAgentProvider | null => {
  if (!panelType) return null;
  for (const provider of providers.values()) {
    if (provider.panelType === panelType) return provider;
  }
  return null;
};

export const getProviderByProcessName = (commandName: string): IAgentProvider | null => {
  for (const provider of providers.values()) {
    if (provider.matchesProcess(commandName)) return provider;
  }
  return null;
};

export const listProviders = (): IAgentProvider[] => Array.from(providers.values());
