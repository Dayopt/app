interface TrpcResponseEntry {
  error?: unknown;
  result?: unknown;
}

function hasOwn(entry: TrpcResponseEntry, key: keyof TrpcResponseEntry): boolean {
  return Object.prototype.hasOwnProperty.call(entry, key);
}

/** Counts only successful checkout mutations whose response occupies the same batch index. */
export function countSuccessfulCheckoutStarts(options: {
  data: readonly unknown[];
  eagerGeneration: boolean;
  paths: readonly string[] | undefined;
}): number {
  if (options.eagerGeneration || !options.paths) return 0;

  return options.paths.reduce((count, path, index) => {
    if (path !== 'billing.createCheckoutSession') return count;

    const entry = options.data[index];
    if (typeof entry !== 'object' || entry === null) return count;

    const response = entry as TrpcResponseEntry;
    return hasOwn(response, 'result') && !hasOwn(response, 'error') ? count + 1 : count;
  }, 0);
}
