import { runGenerationPipeline } from "@workbench/core";

/**
 * 生成 API 路由
 * 直接转发到核心层的生成 pipeline，保证行为与原项目一致
 */
export async function POST(req: Request) {
  return runGenerationPipeline(req);
}
