/**
 * Tripo AI 3D 模型生成 API 封装
 * 文档：https://github.com/funmagic-ai/magi-3d-sdk/blob/main/tripo-llm.txt
 */

const TRIPO_API_BASE = "https://openapi.tripo3d.com/v2/openapi";

export interface TripoTask {
  task_id: string;
  type: string;
  status: "queued" | "running" | "success" | "failed" | "cancelled" | "unknown" | "banned" | "expired";
  input: Record<string, unknown>;
  output: {
    model?: string;
    base_model?: string;
    pbr_model?: string;
    rendered_image?: string;
  };
  progress: number;
  create_time: number;
  error_code?: number;
  error_msg?: string;
}

/**
 * 上传图片到 Tripo，获取 image_token
 */
async function uploadImage(apiKey: string, imageBuffer: Buffer, filename: string): Promise<string> {
  const formData = new FormData();
  const uint8Array = new Uint8Array(imageBuffer);
  const blob = new Blob([uint8Array], { type: "image/png" });
  formData.append("file", blob, filename);

  const response = await fetch(`${TRIPO_API_BASE}/upload/sts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  const data = await response.json();
  if (!response.ok || data.code !== 0) {
    throw new Error(data.msg || `图片上传失败: ${response.status}`);
  }
  return data.data.image_token;
}

/**
 * 下载图片并转换为 Buffer
 */
async function downloadImage(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`图片下载失败: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * 多视图生成3D模型
 * @param apiKey Tripo API Key
 * @param images 4张视图图片URL [front, left, back, right]
 */
export async function multiviewToModel(
  apiKey: string,
  images: string[]
): Promise<string> {
  // 先下载所有图片，然后上传到 Tripo 获取 image_token
  const fileObjects: Array<{ type: string; file_token: string }> = [];
  for (let i = 0; i < images.length; i++) {
    const buffer = await downloadImage(images[i]!);
    const token = await uploadImage(apiKey, buffer, `view-${i + 1}.png`);
    fileObjects.push({ type: "png", file_token: token });
  }

  // 如果不足4张，用空对象补齐
  while (fileObjects.length < 4) {
    fileObjects.push({} as { type: string; file_token: string });
  }

  const response = await fetch(`${TRIPO_API_BASE}/task`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      type: "multiview_to_model",
      model_version: "v2.5-20250123",
      files: fileObjects,
      texture: true,
      pbr: true,
      texture_quality: "standard",
    }),
  });

  const data = await response.json();
  if (!response.ok || data.code !== 0) {
    throw new Error(data.msg || `Tripo API 错误: ${response.status}`);
  }
  return data.data.task_id;
}

/**
 * 查询任务状态
 */
export async function getTaskStatus(apiKey: string, taskId: string): Promise<TripoTask> {
  const response = await fetch(`${TRIPO_API_BASE}/task/${taskId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  const data = await response.json();
  if (!response.ok || data.code !== 0) {
    throw new Error(data.msg || `Tripo API 错误: ${response.status}`);
  }
  return data.data;
}
