export type ProductTemplate = {
  id: string;
  label: string;
  description: string;
  resultStandard: string;
  recommendedStrength?: string;
  promptBrief: string;
};

export const PRODUCT_TEMPLATES: ProductTemplate[] = [
  {
    id: "smart-auto",
    label: "造型突破 / 改款（默认）",
    description: "生成同品类的不同款式方案，变化幅度随重构比例连续扩大",
    resultStandard: "低比例有明确实体改动，中比例重组部件与功能区，高比例形成同细分品类的全新一代造型",
    promptBrief:
      "默认原创重构约束：主产品图是品类、核心任务、使用方式、特征工作长度、必要接口、安全关系和功能依赖的分析依据，不是需要描摹的造型模板。屏幕/反馈、按钮/操作、散热/开孔、握持/支撑、电源/检修、传感/工作端等必需功能要继续成立，但数量、形状、分组、合理位置、外壳包络、体块、分件和视觉布局可随重构比例重新组织。低比例也必须有真实实体造型改动；中比例重组多个部件、功能区和型面；高比例重做轮廓节奏、主次体块、壳体架构、功能区布局与细节系统，90–99% 至少重构五个外观架构层级，且不得保留超过两项高识别度的装饰性原图特征。任何比例都不得把长杆变短杆、改变使用姿态、破坏功能链、安全或细分品类。用户明确的保留/改变要求优先；设计参考图只提取抽象设计 DNA，不得搬运其轮廓、零件、拓扑、品牌或构图。结果要完整、合理、可用，不能为差异而乱切分。"
  },
  {
    id: "functional-architecture",
    label: "功能重构款",
    description: "从用户怎么用出发，换一种更好的方式完成同一个核心功能",
    resultStandard: "使用方式或功能实现必须明显改变；只换外壳、颜色或展示内部元件判定失败",
    recommendedStrength: "建议重构比例 55–99%",
    promptBrief:
      "方向硬约束：先用大白话说明“谁在什么场景下，用它完成什么事”，再找出当前产品在拿、放、坐、穿、夹、装、开、关、收纳、调节或操作过程中的真实麻烦。核心任务不变，但完成任务的方式可以换：例如同样是让人坐，可以是凳子、椅子或沙发；同样是固定手机，不必沿用四角夹。新方案必须让用户一眼看懂怎么放入、固定、释放、调节或使用，并在外观上出现对应的新结构。旧夹臂数量、支撑路径、关节、按钮、开合形式和连接件都可以合并、拆分、移位或替换，只保留品类、安全和核心任务真正需要的部分。严禁用透明壳、剖视图、爆炸图或露出内部元器件来冒充功能创新，除非用户明确要求查看内部；颜色、材质、纹理和机甲装饰也不算功能重构。"
  },
  {
    id: "future-concept",
    label: "未来概念款",
    description: "允许超前机制与交互，探索下一代产品原型",
    resultStandard: "机制、交互、架构中至少两层是新概念；赛博配色或灯带不算未来创新",
    recommendedStrength: "建议重构比例 75–99%",
    promptBrief:
      "方向硬约束：这是前瞻概念探索，不以当前模具、成本和供应链可立即量产为首要限制。保留产品的核心任务、使用场景、用户安全边界和品类可识别性，但允许提出超前的固定/驱动/展开/变形/感应/界面/材料响应方式，重写整体架构、交互流程和形态语言。每个方案至少同时突破机制、交互、空间架构、材料响应中的两层，并说明未来体验价值。不能只加霓虹灯、透明壳、悬浮渲染、赛博纹理或科幻背景；没有新机制或新交互的未来风涂装判定失败。概念可以超前，但内部物理逻辑必须自洽，仍要一眼看出它完成原产品的核心任务。"
  },
  {
    id: "patent-around",
    label: "专利规避款",
    description: "保留源产品设计血统，重写相似保护点",
    resultStandard: "保留至少两项非独占家族语言，同时重写轮廓、比例、分件和关键功能件的受保护特征组合",
    promptBrief:
      "方向硬约束：目标是同品类、同功能认知下的原创外观规避辅助，不是复刻原图，也不代表已经完成法律层面的不侵权判断。先从原图提炼三项非独占的家族设计语言，例如几何母题、界面层级、边缘/圆角逻辑、材质层级或品牌区位置逻辑；每个方案至少保留其中两项，即使重构比例达到 85–99% 也要看得出源产品的设计血统。与此同时，必须重写可能构成外观专利/设计保护点的特征组合：整体轮廓与比例姿态、主体体块关系、分件线、关键功能件外轮廓和位置关系、侧面线条、灯/孔/按钮/把手/轮组/支架等独特形态、品牌区及 CMF 分区。不得把原图完整独特轮廓或整套特征组合当成家族锚点。结果应是同一设计语言下的可量产新款，不能只是换色、删 logo、小修或完全无关的随机造型；仍需专业专利检索与人工判断。"
  },
  {
    id: "detail-page-scene",
    label: "使用体验优化",
    description: "围绕操作、收纳和人机问题改结构",
    resultStandard: "至少一个真实使用痛点被转化成可看见、可解释的新结构",
    promptBrief:
      "方向硬约束：先判断这个产品在拿取、移动、收纳、安装、清洁、开合、握持、观察、承重、防护或操作上最可能出现的痛点，再把对应功能区做成新的可见结构。必须重设计至少一个操作部件、支撑/连接部件或开合/收纳部件，让用户一眼看出它更好用；不能只做涂装和纹理。"
  },
  {
    id: "premium-upgrade",
    label: "高端升级款",
    description: "用比例、细节、工艺和材质把产品拉到更高价格带",
    resultStandard: "比例秩序、功能件隐藏/整合、精细边界、材质工艺共同提升，不能只换深色、金属或背景",
    promptBrief:
      "方向硬约束：把产品重构成更高客单价的升级版本。高端来自比例秩序、线面克制、曲面连续性、边界精度、细节整合、触感材料和真实工艺，而不是简单换黑色、金色或金属贴图。必须体现更干净的体块比例、更精细的倒角/分件线、更一体化或隐藏式的功能件、更合理的品牌区/控制区层级，以及低饱和但有质感的 CMF。避免堆装饰、机甲化、过度镀铬、廉价高亮塑料感和概念化悬浮结构；结果要像可进入高端产品线的真实新款。"
  },
  {
    id: "production-ready",
    label: "量产落地款",
    description: "更像真实能开模投产的新款",
    resultStandard: "新款差异与装配、分件、受力和制造约束同时成立",
    promptBrief:
      "方向硬约束：目标是能进入打样、开模和量产评审的真实产品方案，不是概念炫技图。必须保留核心功能骨架、装配逻辑、受力/握持/穿戴/安装关系和关键部件数量；重点优化可量产的外壳分区、拔模友好的体块、可制造的圆角与分件线、常规材料边界、螺丝/卡扣/开孔/按钮/把手/支架等真实部件表达，以及成本和工艺可控的 CMF。外观要有明确新款差异，但不能出现悬浮结构、过薄尖角、不可脱模倒扣、无法装配的封闭缝、随机装饰或高成本概念机构。"
  },
  {
    id: "low-cost-production",
    label: "低成本量产款",
    description: "少改模，也要有差异",
    resultStandard: "改动集中在可替换件和低成本工艺，但至少有两处实体几何差异",
    promptBrief:
      "方向硬约束：控制生产复杂度，但不能变成只换色。保留基础功能骨架和大部分可量产结构，重点改可替换外壳件、面板、分件线、边角半径、局部装饰件、把手/按钮/开孔/支架外观和分色方式。结果要像工厂能快速打样的新款，而不是高成本概念设计。"
  },
  {
    id: "young-trendy",
    label: "年轻潮流款",
    description: "更轻快，更有传播感",
    resultStandard: "新的体块节奏和一处符号化结构形成潮流感，不能只靠撞色",
    promptBrief:
      "方向硬约束：把产品变成年轻用户更愿意晒、更愿意点开的版本。必须使用更轻快的体块比例、更有张力的功能区、更鲜明的线面秩序，以及一处运动感、科技感、萌感或潮流符号化细节。配色可以更活跃，但必须服务新的造型语言，不能只靠撞色。"
  },
  {
    id: "feature-detail",
    label: "卖点强化款",
    description: "让一个可见功能区成为记忆点",
    resultStandard: "一个核心功能件的形态、比例、位置或交互表达成为第一视觉焦点",
    promptBrief:
      "方向硬约束：选择一个最能表达卖点的可见功能区做强化，例如按钮、握把、灯带、开合件、出风口、轮组、支架、透明窗、收纳区、关节、连接件或控制面板。必须改变该功能件的形态、排列、比例、嵌入方式或周边结构，让细节本身成为卖点；不能改变核心功能数量。"
  },
  {
    id: "series-family",
    label: "系列延展款",
    description: "固定展示 4 个有共同家族特征、但造型和定位明显不同的新 SKU",
    resultStandard: "四款共享家族识别锚点，同时在轮廓、比例、结构和使用定位中至少拉开三项差异",
    recommendedStrength: "建议重构比例 45–99%",
    promptBrief:
      "方向硬约束：主产品图只用于提炼家族特征，绝不能把原产品直接画进结果里充当其中一款。先从主产品提炼三个克制、可复用的家族锚点，例如几何母题、功能界面组织方式、品牌区位置逻辑或 CMF 分区规则；不要把原轮廓整套复制成家族锚点。每张结果必须固定展示 4 个完整、全新设计的 SKU，并为四款分配合理且不同的用户、场景、尺寸或性能定位。四款都继承家族锚点，但每一款必须在轮廓、长宽高比例、主次体块关系、结构拓扑、功能区布局、控制/开口/底座/把手形式或使用姿态中至少改变三项；忽略颜色后仍应一眼看出四种不同造型。不得只做换色、等比缩放、替换一个开孔或重复同一外壳。画面使用同一干净棚拍场景，将四款以 2×2 空间阵列摆放：后排两款、前排两款，四款尺寸足够大、互不遮挡、完整可见，共用透视、光照和地面，不使用分隔线、海报或独立面板。若品类天然成对，每个 SKU 内仍要保持正确的左右/成对关系。"
  }
];

export const CORE_PRODUCT_TEMPLATE_IDS = [
  "smart-auto",
  "functional-architecture",
  "premium-upgrade",
  "low-cost-production",
  "patent-around",
  "series-family",
  "future-concept"
] as const;

export const CORE_PRODUCT_TEMPLATES = CORE_PRODUCT_TEMPLATE_IDS.map((templateId) =>
  PRODUCT_TEMPLATES.find((template) => template.id === templateId)
).filter((template): template is ProductTemplate => Boolean(template));

const LEGACY_TEMPLATE_ALIASES: Record<string, string> = {
  "bestseller-remix": "smart-auto",
  "form-rebuild": "smart-auto",
  "ecommerce-hero": "feature-detail",
  "portable-storage": "detail-page-scene"
};

export function normalizeProductTemplateId(templateId?: string) {
  const normalizedId = templateId ? LEGACY_TEMPLATE_ALIASES[templateId] ?? templateId : PRODUCT_TEMPLATES[0].id;
  return PRODUCT_TEMPLATES.some((template) => template.id === normalizedId) ? normalizedId : PRODUCT_TEMPLATES[0].id;
}

export function getProductTemplate(templateId?: string) {
  const normalizedId = normalizeProductTemplateId(templateId);
  return PRODUCT_TEMPLATES.find((template) => template.id === normalizedId) ?? PRODUCT_TEMPLATES[0];
}
