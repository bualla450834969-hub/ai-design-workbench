export type ProductViewRole = "camera-anchor" | "identity-evidence";

export type ValidatedProductViewEvidence = {
  index: number;
  viewRole: ProductViewRole;
  visibleCues: string[];
  contribution: string;
};

export type ProductViewEvidenceInput = {
  sourceId: string;
};

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

function evidenceSignature(item: ValidatedProductViewEvidence) {
  return `${[...item.visibleCues].sort().join(" ")} ${item.contribution}`;
}

export function validateProductViewEvidence(
  evidenceRaw: unknown,
  productInputs: readonly ProductViewEvidenceInput[]
): ValidatedProductViewEvidence[] {
  const records = Array.isArray(evidenceRaw) ? evidenceRaw : [];
  if (records.length !== productInputs.length) {
    throw new Error(
      `方案模型只识别了 ${records.length} / ${productInputs.length} 张主产品图，本次尚未提交生图。请重新生成，或更换能稳定读取多视图的方案模型。`
    );
  }

  const evidenceByIndex = new Map<number, ValidatedProductViewEvidence>();
  for (const value of records) {
    const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const index = Math.round(Number(record.index));
    const expected = productInputs[index - 1];
    const expectedRole: ProductViewRole = index === 1 ? "camera-anchor" : "identity-evidence";
    if (!expected || evidenceByIndex.has(index) || record.viewRole !== expectedRole) {
      throw new Error("方案模型返回的主产品图编号或视图职责不完整，本次尚未提交生图。请重新生成。");
    }

    const visibleCues = (Array.isArray(record.visibleCues) ? record.visibleCues : [])
      .map((cue) => String(cue || "").trim().slice(0, 140))
      .filter(Boolean);
    const contribution = String(record.contribution || "").trim().slice(0, 260);
    if (visibleCues.length < 2 || contribution.length < 12) {
      throw new Error(
        `主产品图 ${index} 的独立可见线索提取不完整，本次尚未提交生图。请重新生成，或更换能稳定读取多视图的方案模型。`
      );
    }
    evidenceByIndex.set(index, { index, viewRole: expectedRole, visibleCues, contribution });
  }

  const evidence = productInputs.map((_, index) => evidenceByIndex.get(index + 1));
  if (evidence.some((item) => !item)) {
    throw new Error("方案模型遗漏了部分主产品视图，本次尚未提交生图。请重新生成。");
  }
  const validated = evidence as ValidatedProductViewEvidence[];

  for (let currentIndex = 1; currentIndex < validated.length; currentIndex += 1) {
    const currentSignature = evidenceSignature(validated[currentIndex]);
    for (let previousIndex = 0; previousIndex < currentIndex; previousIndex += 1) {
      if (productInputs[currentIndex].sourceId === productInputs[previousIndex].sourceId) continue;
      const previousSignature = evidenceSignature(validated[previousIndex]);
      const normalizedCurrent = normalizeEvidenceText(currentSignature);
      const normalizedPrevious = normalizeEvidenceText(previousSignature);
      const duplicated = normalizedCurrent === normalizedPrevious;
      const containedDuplicate =
        Math.min(normalizedCurrent.length, normalizedPrevious.length) >= 48 &&
        (normalizedCurrent.includes(normalizedPrevious) || normalizedPrevious.includes(normalizedCurrent));
      const nearDuplicated =
        Math.min(normalizedCurrent.length, normalizedPrevious.length) >= 48 &&
        evidenceSimilarity(currentSignature, previousSignature) >= 0.97;
      if (duplicated || containedDuplicate || nearDuplicated) {
        throw new Error(
          `主产品图 ${validated[currentIndex].index} 的识别证据与前一张高度重复，可能仍只读取了第一张。本次尚未提交生图，请重新生成或更换方案模型。`
        );
      }
    }
  }

  return validated;
}
