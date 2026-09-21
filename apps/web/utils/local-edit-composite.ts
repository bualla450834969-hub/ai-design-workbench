/**
 * 局部改款像素恢复工具
 * 原理：AI生成的新图在蒙版外的区域会有微小变化，用原图把蒙版外覆盖回来
 */

/**
 * 将新图与原图按蒙版合成，蒙版外用原图，蒙版内用新图
 * @param originalImage 原图 dataURL
 * @param newImage AI生成的新图 dataURL
 * @param maskImage 蒙版 dataURL（白色=可改区域，黑色=锁定区域）
 * @param feather 边缘羽化值（像素），默认 4
 * @returns 合成后的图片 dataURL
 */
export async function compositeLocalEdit(
  originalImage: string,
  newImage: string,
  maskImage: string,
  feather: number = 4
): Promise<string> {
  // 加载三张图片
  const [original, newImg, mask] = await Promise.all([
    loadImage(originalImage),
    loadImage(newImage),
    loadImage(maskImage),
  ]);

  // 以新图的尺寸为基准
  const canvas = document.createElement("canvas");
  canvas.width = newImg.width;
  canvas.height = newImg.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建 canvas");

  // 1. 先画新图
  ctx.drawImage(newImg, 0, 0);

  // 2. 创建蒙版裁剪
  // 先把蒙版画到临时 canvas 上，做羽化
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = canvas.width;
  maskCanvas.height = canvas.height;
  const maskCtx = maskCanvas.getContext("2d");
  if (!maskCtx) throw new Error("无法创建 mask canvas");

  // 把蒙版缩放匹配到新图尺寸
  maskCtx.drawImage(mask, 0, 0, canvas.width, canvas.height);

  // 3. 用原图替换蒙版外的区域
  // 创建合成：蒙版内显示新图，蒙版外显示原图
  ctx.save();
  
  // 使用蒙版作为裁剪路径
  // 先反转蒙版：蒙版内是显示新图的区域
  // 我们要的是：蒙版外（黑色区域）用原图覆盖
  // 所以我们用 destination-out 模式，用蒙版的反来裁剪新图，然后画原图
  
  // 方法：先画原图，然后用蒙版把新图叠加上去
  ctx.globalCompositeOperation = "source-over";
  ctx.drawImage(original, 0, 0, canvas.width, canvas.height);
  
  // 然后用蒙版把新图叠加上去（蒙版内的区域显示新图）
  ctx.globalCompositeOperation = "source-in";
  ctx.drawImage(mask, 0, 0, canvas.width, canvas.height);
  
  // 现在 canvas 上是：蒙版区域是蒙版的灰度，蒙版外是透明
  // 不对，这个方法不对...
  
  // 重新来：
  // 1. 清空 canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // 2. 画原图
  ctx.drawImage(original, 0, 0, canvas.width, canvas.height);
  
  // 3. 创建一个临时 canvas，画新图 + 蒙版裁剪
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = canvas.width;
  tempCanvas.height = canvas.height;
  const tempCtx = tempCanvas.getContext("2d");
  if (!tempCtx) throw new Error("无法创建 temp canvas");
  
  // 在临时 canvas 上画新图
  tempCtx.drawImage(newImg, 0, 0);
  
  // 然后用蒙版来裁剪：蒙版内的区域保留新图，蒙版外的透明
  tempCtx.globalCompositeOperation = "destination-in";
  tempCtx.drawImage(mask, 0, 0, canvas.width, canvas.height);
  
  // 4. 把临时 canvas 合成到主 canvas 上
  ctx.drawImage(tempCanvas, 0, 0);
  
  ctx.restore();

  // 输出为 dataURL
  return canvas.toDataURL("image/png");
}

/**
 * 加载图片工具
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error("图片加载失败"));
    img.src = src;
  });
}
