export type WorkspaceRasterMimeType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

function ascii(bytes: Uint8Array, start: number, length: number) {
  if (bytes.length < start + length) return "";
  return String.fromCharCode(...bytes.slice(start, start + length));
}

function hasBytes(bytes: Uint8Array, offset: number, expected: readonly number[]) {
  if (bytes.length < offset + expected.length) return false;
  return expected.every((value, index) => bytes[offset + index] === value);
}

function positiveBigEndian32(bytes: Uint8Array, offset: number) {
  if (bytes.length < offset + 4) return false;
  return (((bytes[offset] << 24) >>> 0) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) > 0;
}

function positiveLittleEndian16(bytes: Uint8Array, offset: number) {
  if (bytes.length < offset + 2) return false;
  return bytes[offset] + (bytes[offset + 1] << 8) > 0;
}

/**
 * Identifies only complete-looking raster containers that the workspace can
 * display. The browser still performs a real decode before the Blob is stored.
 */
export function detectWorkspaceImageContainer({
  header,
  footer,
  byteLength
}: {
  header: Uint8Array;
  footer: Uint8Array;
  byteLength: number;
}): WorkspaceRasterMimeType | "" {
  if (
    byteLength >= 45 &&
    hasBytes(header, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) &&
    ascii(header, 12, 4) === "IHDR" &&
    positiveBigEndian32(header, 16) &&
    positiveBigEndian32(header, 20) &&
    hasBytes(footer, Math.max(0, footer.length - 12), [0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82])
  ) {
    return "image/png";
  }

  if (
    byteLength >= 32 &&
    hasBytes(header, 0, [0xff, 0xd8, 0xff]) &&
    footer.length >= 2 &&
    footer[footer.length - 2] === 0xff &&
    footer[footer.length - 1] === 0xd9
  ) {
    return "image/jpeg";
  }

  if (
    byteLength >= 20 &&
    ascii(header, 0, 4) === "RIFF" &&
    ascii(header, 8, 4) === "WEBP" &&
    ["VP8 ", "VP8L", "VP8X"].includes(ascii(header, 12, 4))
  ) {
    const declaredLength =
      header[4] +
      (header[5] << 8) +
      (header[6] << 16) +
      ((header[7] << 24) >>> 0) +
      8;
    if (declaredLength === byteLength) return "image/webp";
  }

  if (
    byteLength >= 14 &&
    /^GIF8[79]a$/.test(ascii(header, 0, 6)) &&
    positiveLittleEndian16(header, 6) &&
    positiveLittleEndian16(header, 8) &&
    footer.length > 0 &&
    footer[footer.length - 1] === 0x3b
  ) {
    return "image/gif";
  }

  return "";
}

export async function detectWorkspaceImageBlobMimeType(blob: Blob) {
  if (!blob.size) return "";
  const header = new Uint8Array(await blob.slice(0, 32).arrayBuffer());
  const footer = new Uint8Array(await blob.slice(Math.max(0, blob.size - 16)).arrayBuffer());
  return detectWorkspaceImageContainer({ header, footer, byteLength: blob.size });
}
