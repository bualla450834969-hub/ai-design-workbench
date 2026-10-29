/** A generated image is persisted by the app, separately from an optional browser download. */
export function projectStorageLocation(webMode = process.env.WEB_MODE === "true") {
  return webMode ? "服务器项目" : "本机项目文件夹";
}

/** Adapt legacy generated-result notices without rewriting users' prompts or ordinary answers. */
export function resultStorageCopy(text: string, webMode: boolean) {
  if (!webMode) return text;
  if (process.env.NEXT_PUBLIC_WEB_LOCAL_MODE === "true") return text
    .replace(/已保存到(?:本机项目文件夹|服务器项目)/g, "已保存到本机浏览器")
    .replace(/已保存到本机(?!浏览器)/g, "已保存到本机浏览器")
    .replace(/服务器保存失败/g, "本机浏览器保存失败")
    .replace(/未保存到服务器项目/g, "未保存到本机浏览器");
  return text
    .replace(/已保存到本机项目文件夹/g, "已保存到服务器项目")
    .replace(/已保存到本机/g, "已保存到服务器项目")
    .replace(/已保存本机/g, "已保存到服务器项目")
    .replace(/本地保存失败/g, "服务器保存失败")
    .replace(/未保存本机/g, "未保存到服务器项目");
}
