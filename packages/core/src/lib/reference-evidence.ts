export type RequestedReferenceRole = "auto" | "form" | "color" | "material" | "style";
export type ResolvedReferenceRole = Exclude<RequestedReferenceRole, "auto">;

export type ValidatedReferenceEvidence = {
  index: number;
  role: ResolvedReferenceRole;
  cues: string[];
  mapping: string;
};

export type ReferenceEvidenceInput = {
  role: RequestedReferenceRole;
  sourceId: string;
};

function isResolvedReferenceRole(value: unknown): value is ResolvedReferenceRole {
  return value === "form" || value === "color" || value === "material" || value === "style";
}

function normalizeEvidenceText(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function characterNgrams(value: string, size = 3) {
  const normalized = normalizeEvidenceText(value);
  const grams = new Set<string>();
  if (normalized.length < size) {
    if (normalized) grams.add(normalized);
    return grams;
  }
  for (let index = 0; index <= normalized.length - size; index += 1) {
    grams.add(normalized.slice(index, index + size));
  }
  return grams;
}

function evidenceSimilarity(left: string, right: string) {
  const leftGrams = characterNgrams(left);
  const rightGrams = characterNgrams(right);
  if (!leftGrams.size || !rightGrams.size) return 0;
  let overlap = 0;
  leftGrams.forEach((gram) => {
    if (rightGrams.has(gram)) overlap += 1;
  });
  return overlap / Math.max(1, leftGrams.size + rightGrams.size - overlap);
}

function evidenceSignature(item: ValidatedReferenceEvidence) {
  return `${[...item.cues].sort().join(" ")} ${item.mapping}`;
}

export function validateReferenceEvidence(
  evidenceRaw: unknown,
  referenceInputs: readonly ReferenceEvidenceInput[]
): ValidatedReferenceEvidence[] {
  const records = Array.isArray(evidenceRaw) ? evidenceRaw : [];
  if (records.length !== referenceInputs.length) {
    throw new Error(`方案模型只识别了 ${records.length} / ${referenceInputs.length} 张设计参考图，本次尚未提交生图。请重新生成，或更换能稳定读取多图的方案模型。`);
  }

  const evidenceByIndex = new Map<number, ValidatedReferenceEvidence>();
  for (const value of records) {
    const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const referenceIndex = Math.round(Number(record.index));
    const expected = referenceInputs[referenceIndex - 1];
    const resolvedRole = record.resolvedRole;
    if (!expected || evidenceByIndex.has(referenceIndex) || !isResolvedReferenceRole(resolvedRole)) {
      throw new Error("方案模型返回的参考图编号或用途不完整，本次尚未提交生图。请重新生成。");
    }
    if (expected.role !== "auto" && expected.role !== resolvedRole) {
      throw new Error(`设计参考图 ${referenceIndex} 的指定用途没有被正确执行，本次尚未提交生图。请重新生成。`);
    }

    const cues = (Array.isArray(record.cues) ? record.cues : [])
      .map((cue) => String(cue || "").trim().slice(0, 140))
      .filter(Boolean);
    const minimumCueCount = resolvedRole === "form" ? 4 : 2;
    const mapping = String(record.mapping || "").trim().slice(0, 260);
    if (cues.length < minimumCueCount || mapping.length < 12) {
      throw new Error(`设计参考图 ${referenceIndex} 的可见特征提取不完整，本次尚未提交生图。请重新生成，或更换能稳定读图的方案模型。`);
    }
    evidenceByIndex.set(referenceIndex, {
      index: referenceIndex,
      role: resolvedRole,
      cues,
      mapping
    });
  }

  const evidence = referenceInputs.map((_, index) => evidenceByIndex.get(index + 1));
  if (evidence.some((item) => !item)) {
    throw new Error("方案模型遗漏了部分设计参考图，本次尚未提交生图。请重新生成。");
  }
  const validated = evidence as ValidatedReferenceEvidence[];

  for (let currentIndex = 1; currentIndex < validated.length; currentIndex += 1) {
    const current = validated[currentIndex];
    const currentSignature = evidenceSignature(current);
    for (let previousIndex = 0; previousIndex < currentIndex; previousIndex += 1) {
      if (referenceInputs[currentIndex].sourceId === referenceInputs[previousIndex].sourceId) continue;
      const previousSignature = evidenceSignature(validated[previousIndex]);
      const normalizedCurrent = normalizeEvidenceText(currentSignature);
      const normalizedPrevious = normalizeEvidenceText(previousSignature);
      const duplicated = normalizedCurrent === normalizedPrevious;
      const containedDuplicate =
        Math.min(normalizedCurrent.length, normalizedPrevious.length) >= 48 &&
        (normalizedCurrent.includes(normalizedPrevious) || normalizedPrevious.includes(normalizedCurrent));
      const nearDuplicated =
        Math.min(normalizedCurrent.length, normalizedPrevious.length) >= 48 &&
        evidenceSimilarity(currentSignature, previousSignature) >= 0.92;
      if (duplicated || containedDuplicate || nearDuplicated) {
        throw new Error(`设计参考图 ${current.index} 的识别证据与前一张高度重复，可能仍只读取了同一张图。本次尚未提交生图，请重新生成或更换方案模型。`);
      }
    }
  }

  return validated;
}
