import { persistGeneratedImages, reserveGeneratedResultLabels } from "@/lib/services/result-assets";
import type { ImageOutput } from "@/lib/providers/types";

type Persisted = Awaited<ReturnType<typeof persistGeneratedImages>>;
type Options = Omit<Parameters<typeof persistGeneratedImages>[0], "imageUrls">;

/** Save the response before waiting for another image. The provider still owns
 * generation; this collector never submits or retries a model request. */
export function incrementalImages(options: Options, count: number, onSaved: (saved: Persisted, output: ImageOutput) => void, variantLabels = false) {
  const records = new Map<number, { raw: string; saved: Persisted; variant: NonNullable<ImageOutput["variants"]>[number] | undefined }>();
  const fingerprints: Buffer[] = [];
  let labels = options.labels;
  let serial = Promise.resolve();
  let savingMs = 0;
  const snapshot = (): Persisted => {
    const ordered = [...records.entries()].sort(([a], [b]) => a - b);
    return {
      assets: ordered.flatMap(([, item]) => item.saved.assets), imageUrls: ordered.flatMap(([, item]) => item.saved.imageUrls),
      errors: ordered.flatMap(([index, item]) => item.saved.errors.map((error) => ({ ...error, index }))),
      savedCount: ordered.reduce((sum, [, item]) => sum + item.saved.savedCount, 0),
      unchangedCount: ordered.reduce((sum, [, item]) => sum + item.saved.unchangedCount, 0),
    };
  };
  const put = async (output: ImageOutput, index: number) => {
    const raw = output.imageUrls[0];
    if (!raw || records.get(index)?.raw === raw) return;
    const label = variantLabels ? output.variants?.[0]?.designRoute : (labels ||= reserveGeneratedResultLabels(options.userId, options.projectId, count))[index];
    const started = Date.now();
    const saved = await persistGeneratedImages({ ...options, labels: label ? [label] : undefined, imageUrls: [raw], comparisonSignatures: fingerprints });
    savingMs += Date.now() - started;
    records.set(index, { raw, saved, variant: output.variants?.[0] });
    onSaved(snapshot(), output);
  };
  return {
    onImage(output: ImageOutput, index: number) {
      const next = serial.then(() => put(output, index));
      serial = next.catch(() => {});
      return next;
    },
    snapshot,
    savingMs: () => savingMs,
    async finish(output: ImageOutput) {
      await serial;
      if (!records.size) return persistGeneratedImages({ ...options, imageUrls: output.imageUrls, labels: options.labels || (variantLabels ? output.variants?.map((variant) => variant.designRoute) : undefined) });
      for (let position = 0; position < output.imageUrls.length; position += 1) {
        const index = output.variants?.[position]?.index ?? position;
        if (records.get(index)?.raw !== output.imageUrls[position]) {
          // A sink interruption may need a local save retry, never another model call.
          await put({ ...output, imageUrls: [output.imageUrls[position]], variants: output.variants?.slice(position, position + 1) }, index);
        }
      }
      return snapshot();
    },
  };
}
