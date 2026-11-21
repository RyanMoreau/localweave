export const toError = (value: unknown) => value instanceof Error ? value : new Error(String(value))
