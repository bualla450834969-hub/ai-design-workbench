/** Follow the caller's visible order; reaching an end never jumps to an unrelated first/last image. */
export function imagePreviewNeighbor<T extends { id: string }>(assets: T[], currentId: string, offset: -1 | 1): T | undefined {
  const index = assets.findIndex((asset) => asset.id === currentId);
  return index < 0 ? undefined : assets[index + offset];
}
