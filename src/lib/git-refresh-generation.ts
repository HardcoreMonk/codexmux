export interface IGitRefreshConsumptionInput {
  consumed: Readonly<Record<string, number>>;
  sessionName: string;
  generation: number;
  active: boolean;
}

export interface IGitRefreshConsumptionResult {
  shouldRefresh: boolean;
  consumed: Readonly<Record<string, number>>;
}

export const consumeGitRefreshGeneration = ({
  consumed,
  sessionName,
  generation,
  active,
}: IGitRefreshConsumptionInput): IGitRefreshConsumptionResult => {
  if (!sessionName || !active || generation <= 0 || generation <= (consumed[sessionName] ?? 0)) {
    return { shouldRefresh: false, consumed };
  }

  return {
    shouldRefresh: true,
    consumed: {
      ...consumed,
      [sessionName]: generation,
    },
  };
};
