import type { VideoIntroductionOptions, VideoMotion, VideoPurpose } from "@/lib/video-types";

export function videoIntroductionDefaults(projectName?: string): VideoIntroductionOptions {
  const name = projectName?.trim();
  return name && name.length <= 80 && !/^(?:新建项目|未命名项目|新项目)(?:\s*\d+)?$/.test(name) ? { productName: name } : {};
}

export function introductionOptions(input: VideoIntroductionOptions): VideoIntroductionOptions {
  const productName = input.productName?.trim();
  const sellingPoint = input.sellingPoint?.trim();
  const usageScene = input.usageScene?.trim();
  const narration = input.narration?.trim();
  return {
    ...(productName ? { productName } : {}),
    ...(sellingPoint ? { sellingPoint } : {}),
    ...(usageScene ? { usageScene } : {}),
    ...(narration ? { narration } : {}),
  };
}

export function introductionShotPreview(input: VideoIntroductionOptions): { title: string; description: string }[] {
  const options = introductionOptions(input);
  return [
    { title: "产品亮相", description: `${options.productName || "所选产品"}从首帧清晰出现，镜头小幅环绕，展示有视差的整体外观。` },
    { title: "卖点细节", description: options.sellingPoint ? `围绕「${options.sellingPoint}」横移镜头，展示相关细节。` : "切换至材质和结构近景，横移镜头展示细节。" },
    { title: "场景收尾", description: options.usageScene ? `切换到「${options.usageScene}」中的完整外观，平稳运镜收尾。` : "切换回完整外观，用原背景或简洁棚拍收尾。" },
  ];
}

export function videoSubmissionSettings(input: {
  model: string;
  duration: 5 | 10;
  motion: VideoMotion;
  purpose: VideoPurpose;
  introduction: VideoIntroductionOptions;
}) {
  return {
    model: input.model,
    duration: input.duration,
    motion: input.motion,
    purpose: input.purpose,
    ...(input.purpose === "introduction" ? { introduction: introductionOptions(input.introduction) } : {}),
  };
}
