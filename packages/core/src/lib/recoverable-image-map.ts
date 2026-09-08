export type RecoverableImageMapResult<T> = {
  items: T[];
  attemptedCount: number;
  recoveredCount: number;
  failedCount: number;
};

/**
 * Converts/restores image-bearing records independently so one expired image
 * cannot make every other usable image in the same history batch disappear.
 */
export async function mapRecoverableImages<TInput, TOutput>(
  items: readonly TInput[],
  transform: (item: TInput, index: number) => Promise<TOutput | null> | TOutput | null
): Promise<RecoverableImageMapResult<TOutput>> {
  const candidates: Array<TOutput | null> = await Promise.all(items.map(async (item, index) => {
    try {
      return await transform(item, index) as TOutput | null;
    } catch {
      return null;
    }
  }));
  const recovered = candidates.filter((item): item is TOutput => item !== null);
  return {
    items: recovered,
    attemptedCount: items.length,
    recoveredCount: recovered.length,
    failedCount: Math.max(0, items.length - recovered.length)
  };
}
