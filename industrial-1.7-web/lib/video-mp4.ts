type Mp4Box = { type: string; payloadStart: number; end: number };

/**
 * Reads MP4 media handlers, without inspecting encoded samples or judging sound.
 * Undefined means the container/track structure is incomplete or unsupported.
 */
export function mp4HasAudioTrack(bytes: Uint8Array): boolean | undefined {
  if (bytes.byteLength < 8) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Normal movies have a small number of boxes at the inspected levels. Bound
  // work and allocations for malformed supplier files containing tiny boxes.
  let boxesRemaining = 10_000;
  const fourcc = (offset: number) => String.fromCharCode(
    bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3],
  );

  function boxes(start: number, end: number): Mp4Box[] | undefined {
    const result: Mp4Box[] = [];
    for (let cursor = start; cursor < end;) {
      if (--boxesRemaining < 0 || end - cursor < 8) return undefined;
      let size = view.getUint32(cursor);
      let headerSize = 8;
      if (size === 1) {
        if (end - cursor < 16) return undefined;
        const extendedSize = view.getBigUint64(cursor + 8);
        if (extendedSize > BigInt(Number.MAX_SAFE_INTEGER)) return undefined;
        size = Number(extendedSize);
        headerSize = 16;
      } else if (size === 0) {
        size = end - cursor;
      }
      if (size < headerSize || size > end - cursor) return undefined;
      result.push({ type: fourcc(cursor + 4), payloadStart: cursor + headerSize, end: cursor + size });
      cursor += size;
    }
    return result;
  }

  const top = boxes(0, bytes.byteLength);
  if (!top) return undefined;
  const movies = top.filter((box) => box.type === "moov");
  if (movies.length !== 1) return undefined;
  const movie = boxes(movies[0].payloadStart, movies[0].end);
  if (!movie) return undefined;
  const tracks = movie.filter((box) => box.type === "trak");
  if (!tracks.length) return undefined;

  let hasVideo = false;
  let hasAudio = false;
  for (const track of tracks) {
    const trackChildren = boxes(track.payloadStart, track.end);
    if (!trackChildren) return undefined;
    const media = trackChildren.filter((box) => box.type === "mdia");
    if (media.length !== 1) return undefined;
    const mediaChildren = boxes(media[0].payloadStart, media[0].end);
    if (!mediaChildren) return undefined;
    const handlers = mediaChildren.filter((box) => box.type === "hdlr");
    if (handlers.length !== 1) return undefined;
    const handler = handlers[0];
    // Version 0 FullBox: version/flags + pre_defined + handler_type + reserved.
    if (handler.end - handler.payloadStart < 24 || bytes[handler.payloadStart] !== 0) return undefined;
    const type = fourcc(handler.payloadStart + 8);
    if (type === "soun") hasAudio = true;
    else if (type === "vide") hasVideo = true;
    else return undefined;
  }
  return hasAudio ? true : hasVideo ? false : undefined;
}
