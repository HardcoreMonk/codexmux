import type { IAgentProvider } from '@/lib/providers/types';
import { normalizePanelType } from '@/lib/panel-type';

export type TAgentProviderContractViolation =
  | 'invalid-id'
  | 'empty-display-name'
  | 'invalid-panel-type'
  | 'duplicate-id'
  | 'duplicate-panel-type';

const g = globalThis as unknown as { __ptAgentProviders?: Map<string, IAgentProvider> };
if (!g.__ptAgentProviders) g.__ptAgentProviders = new Map();
const providers = g.__ptAgentProviders;

export const validateAgentProviderContract = (
  provider: IAgentProvider,
  existingProviders: IAgentProvider[] = Array.from(providers.values()),
): TAgentProviderContractViolation[] => {
  const violations: TAgentProviderContractViolation[] = [];
  const id = provider.id.trim();

  if (!/^[a-z0-9-]+$/.test(id)) violations.push('invalid-id');
  if (!provider.displayName.trim()) violations.push('empty-display-name');
  if (normalizePanelType(provider.panelType) !== provider.panelType) violations.push('invalid-panel-type');
  if (existingProviders.some((existing) => existing.id === provider.id)) violations.push('duplicate-id');
  if (existingProviders.some((existing) => existing.panelType === provider.panelType)) violations.push('duplicate-panel-type');

  return violations;
};

const assertAgentProviderContract = (provider: IAgentProvider): void => {
  const violations = validateAgentProviderContract(provider);
  if (violations.length === 0) return;

  throw Object.assign(
    new Error(`Invalid agent provider contract: ${violations.join(', ')}`),
    {
      code: 'invalid-agent-provider-contract',
      violations,
    },
  );
};

export const registerProvider = (provider: IAgentProvider): void => {
  assertAgentProviderContract(provider);
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
