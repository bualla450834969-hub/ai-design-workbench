/** Submission order is shared by image turns, standalone image jobs and video
 * jobs. Polling/completion timestamps must never move an existing turn. */
export function projectTimeline<T extends { key: string; createdAt?: string; startedAt?: number }>(items: T[]): T[] {
  return items.map((item, ordinal) => ({ item, ordinal }))
    .sort((a, b) => (Date.parse(a.item.createdAt || "") || a.item.startedAt || 0)
      - (Date.parse(b.item.createdAt || "") || b.item.startedAt || 0) || a.ordinal - b.ordinal)
    .map(({ item }) => item);
}
