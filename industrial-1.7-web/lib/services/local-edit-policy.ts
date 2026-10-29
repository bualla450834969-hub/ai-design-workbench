export type LocalWorkflowKind = "shape" | "cmf" | "decal";

export function localWorkflowKind(value: unknown): LocalWorkflowKind {
  if (value === undefined || value === null || value === "") return "shape";
  if (value === "shape" || value === "cmf" || value === "decal") return value;
  throw new Error("局部改图只支持造型、CMF和贴花；视图与场景请使用整体设计。本次尚未创建生成任务。");
}

export function isLocalSurfaceEditing(input: { agentId?: string; generationMode?: unknown; workflowKind?: unknown }) {
  return (input.agentId === "local-retouch" || input.generationMode === "local") && (input.workflowKind === "cmf" || input.workflowKind === "decal");
}

export const LOCAL_SURFACE_SCOPE_CONSTRAINT = "修改范围只能是本轮文字明确指定或标注指向的区域；标注图仅用于定位，不是蒙版或产品结构。未指定区域的配色、材质、贴花、纹理、光影和背景保持干净原图一致；包括指定区域在内的全部轮廓、几何、结构、比例、部件数量与位置、开孔、接口、观察角度、透视、姿态、画幅和主体位置都必须保持原样。目标不清楚时不得扩大为全图编辑，不能为了批次差异额外改动第二处表面。最终输出无标记的完整原画幅产品图，不裁切、不拼贴、不保留圈线、箭头、文字框或标注文字。";

export function localSurfaceContract(kind: "cmf" | "decal") {
  const operation = kind === "cmf"
    ? "本轮是局部 CMF：仅替换指定区域的颜色、材质、纹理、光泽或表面工艺，不重设计任何造型，不新增贴花或图形；其他区域的CMF不变。"
    : "本轮是局部贴花：仅在指定区域修改贴花、图案及其排布，保持原曲面和透视贴合，不改动区域外的图案、标识或CMF，不新增零件、凹凸结构或开孔。";
  return `${operation}${LOCAL_SURFACE_SCOPE_CONSTRAINT}`;
}
