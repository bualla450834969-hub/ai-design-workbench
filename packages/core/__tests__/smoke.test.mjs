/**
 * 核心层冒烟测试（v1.0.0 稳定基线）
 * 验证所有模块可正常导入，关键函数存在
 * 运行：node --test __tests__/
 */
import { test } from "node:test";
import assert from "node:assert";

test("核心层可正常导入", async () => {
  const core = await import("../dist/index.js");
  assert.ok(core, "核心层应能正常导入");
});

test("设计模板可导入", async () => {
  const { PRODUCT_TEMPLATES, getProductTemplate } = await import(
    "../dist/index.js"
  );
  assert.ok(Array.isArray(PRODUCT_TEMPLATES), "PRODUCT_TEMPLATES 应为数组");
  assert.ok(PRODUCT_TEMPLATES.length > 0, "至少应有一个设计模板");
  assert.strictEqual(typeof getProductTemplate, "function");
});

test("4个供应商函数均可导入", async () => {
  const core = await import("../dist/index.js");
  assert.strictEqual(typeof core.callGeekNowChatCompletion, "function");
  assert.strictEqual(typeof core.generateGeekNowImageEdit, "function");
  assert.strictEqual(typeof core.callAPIYIChatCompletion, "function");
  assert.strictEqual(typeof core.generateAPIYIImageEdit, "function");
  assert.strictEqual(typeof core.callAIHubMixChatCompletion, "function");
  assert.strictEqual(typeof core.generateAIHubMixImageEdit, "function");
  assert.strictEqual(typeof core.callCustomOpenAIChatCompletion, "function");
  assert.strictEqual(typeof core.generateCustomOpenAIImageEdit, "function");
});

test("生成 pipeline 可导入", async () => {
  const { runGenerationPipeline } = await import("../dist/index.js");
  assert.strictEqual(typeof runGenerationPipeline, "function");
});

test("质量校验与工具函数可导入", async () => {
  const core = await import("../dist/index.js");
  assert.strictEqual(typeof core.buildReferenceColorPalette, "function");
  assert.strictEqual(typeof core.validateReferenceEvidence, "function");
  assert.strictEqual(typeof core.validateProductViewEvidence, "function");
  assert.strictEqual(typeof core.normalizeLocalEditIntent, "function");
  assert.strictEqual(typeof core.ensureGeneratedImageResolution, "function");
});

test("授权模块可导入", async () => {
  const { requireLicense, activateLicense, LicenseError } = await import(
    "../dist/index.js"
  );
  assert.strictEqual(typeof requireLicense, "function");
  assert.strictEqual(typeof activateLicense, "function");
  assert.ok(LicenseError);
});

test("模型配置可导入", async () => {
  const { BRAIN_MODELS, IMAGE_MODELS } = await import("../dist/index.js");
  assert.ok(Array.isArray(BRAIN_MODELS));
  assert.ok(Array.isArray(IMAGE_MODELS));
  assert.ok(BRAIN_MODELS.length > 0);
  assert.ok(IMAGE_MODELS.length > 0);
});

test("模板数量与原项目一致（11种设计方向）", async () => {
  const { PRODUCT_TEMPLATES } = await import("../dist/index.js");
  // 原项目有 11 种设计方向模板
  assert.strictEqual(PRODUCT_TEMPLATES.length, 11, `应有 11 种模板，实际 ${PRODUCT_TEMPLATES.length}`);
});
