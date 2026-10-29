import path from "node:path";

export function dataRoot() {
  const configured = process.env.IDAI_DATA_DIR?.trim();
  return configured ? path.resolve(configured) : path.join(process.cwd(), ".data");
}

export function dataPath(...segments: string[]) {
  return path.join(dataRoot(), ...segments);
}
