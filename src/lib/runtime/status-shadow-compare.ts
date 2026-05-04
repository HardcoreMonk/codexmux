export interface IRuntimeStatusShadowCompareResult {
  ok: boolean;
  mismatches: IRuntimeStatusShadowMismatch[];
}

export interface IRuntimeStatusShadowMismatch {
  label: string;
  field: string;
  expected: string | boolean | null;
  actual: string | boolean | null;
}

const comparableValue = (value: unknown): string | boolean | null => {
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  return null;
};

export const compareRuntimeStatusShadowDecision = (
  label: string,
  expected: object,
  actual: object,
): IRuntimeStatusShadowCompareResult => {
  const expectedRecord = expected as Record<string, unknown>;
  const actualRecord = actual as Record<string, unknown>;
  const fields = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  const mismatches: IRuntimeStatusShadowMismatch[] = [];

  for (const field of [...fields].sort()) {
    const expectedValue = comparableValue(expectedRecord[field]);
    const actualValue = comparableValue(actualRecord[field]);
    if (expectedValue === actualValue) continue;
    mismatches.push({ label, field, expected: expectedValue, actual: actualValue });
  }

  return { ok: mismatches.length === 0, mismatches };
};
