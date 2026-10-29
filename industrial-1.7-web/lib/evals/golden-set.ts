import type { AgentId } from "@/types/domain";

export interface EvaluationTask {
  id: string;
  agentId: AgentId;
  product: string;
  prompt: string;
  requiredChecks: string[];
  hardFailures: string[];
}

const products = [
  { id: "speaker", name: "桌面蓝牙音响", user: "城市租房青年", structure: "扬声器开孔、音量旋钮、Type-C接口" },
  { id: "dryer", name: "高速吹风机", user: "长发女性用户", structure: "进风口、出风筒、电源线与握持区" },
  { id: "massager", name: "便携筋膜枪", user: "轻运动人群", structure: "电机轴线、握把、电池仓与按摩头接口" },
  { id: "coffee", name: "便携咖啡机", user: "通勤与露营用户", structure: "水仓、胶囊仓、加热区与出液口" },
  { id: "lamp", name: "桌面学习灯", user: "学生与居家办公用户", structure: "转轴、发光面、底座与电源接口" },
  { id: "router", name: "家庭无线路由器", user: "年轻家庭", structure: "天线、散热、网口与指示灯" },
  { id: "cleaner", name: "手持除螨仪", user: "有儿童的家庭", structure: "吸入口、滚刷、尘杯与握把" },
  { id: "projector", name: "微型投影仪", user: "租房与旅行用户", structure: "镜头、散热、支架与接口" },
  { id: "kettle", name: "旅行电热水壶", user: "差旅人士", structure: "壶盖、发热底座、出水口与密封" },
  { id: "camera", name: "户外运动相机", user: "骑行与潜水用户", structure: "镜头、防水壳、按键、屏幕与安装接口" },
];

const workflows: Array<{ id: AgentId; prompt: (product: typeof products[number]) => string; checks: string[]; failures: string[] }> = [
  {
    id: "brief-director",
    prompt: (p) => `为${p.user}规划一款${p.name}，请把零散想法整理成设计任务书。现有结构必须保留：${p.structure}。`,
    checks: ["项目目标清楚", "显性与隐性需求分离", "硬约束完整", "风险和行动项可执行"],
    failures: ["捏造市场数字", "遗漏指定结构", "只复述不做判断"],
  },
  {
    id: "concept-architect",
    prompt: (p) => `围绕${p.name}发散四个真正不同且可量产的概念，目标用户是${p.user}，保留${p.structure}。`,
    checks: ["四方向差异明确", "包含造型语言与CMF", "考虑制造工艺", "给出推荐与取舍"],
    failures: ["仅换颜色", "明显无法制造", "改变核心品类"],
  },
  {
    id: "appearance-variants",
    prompt: (p) => `为${p.name}做保守、中度、创新、突破四档外观变款；${p.structure}不可删除或移位。`,
    checks: ["四档强度递增", "结构锚点明确", "产品身份一致", "材质与分件合理"],
    failures: ["功能件消失", "四图重复", "照搬品牌造型"],
  },
  {
    id: "render-studio",
    prompt: (p) => `把${p.name}白模渲染为品牌官网摄影图，结构依据仅来自原图，CMF采用暖灰哑光和阳极铝点缀。`,
    checks: ["结构图与风格图角色正确", "材质真实", "光向一致", "商业构图完整"],
    failures: ["结构被参考图改变", "产品裁切", "文字与标识乱码"],
  },
  {
    id: "local-retouch",
    prompt: (p) => `根据${p.name}完整标注图，把圈出的区域改成深灰细磨砂，保持整体视角和原有光影，输出无标记的完整产品图。`,
    checks: ["正确理解标注位置", "边缘融合自然", "产品完整", "最终标记消失"],
    failures: ["只输出局部裁切", "标记残留", "贴片或拼接感"],
  },
  {
    id: "multi-view",
    prompt: (p) => `基于${p.name}单张参考图生成前后左右上下六视图，保持${p.structure}、比例和CMF一致。`,
    checks: ["六角度覆盖", "无重复视图", "产品身份一致", "尺度和标签一致"],
    failures: ["重复角度", "部件数量变化", "冒充工程图纸"],
  },
];

export const goldenEvaluationSet: EvaluationTask[] = workflows.flatMap((workflow) => products.map((product) => ({
  id: `${workflow.id}-${product.id}`,
  agentId: workflow.id,
  product: product.name,
  prompt: workflow.prompt(product),
  requiredChecks: workflow.checks,
  hardFailures: workflow.failures,
})));
