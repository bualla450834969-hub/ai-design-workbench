export type TabletWorkflow = {
  id: string;
  label: string;
  hint: string;
  applicationMode: string;
  templateId: string;
  localEdit: boolean;
};

export const TABLET_WORKFLOWS: TabletWorkflow[] = [
  {
    id: "appearance",
    label: "外观改款",
    hint: "上传原图，按要求批量生成差异化外观方案",
    applicationMode: "appearance-redesign",
    templateId: "smart-auto",
    localEdit: false,
  },
  {
    id: "cmf",
    label: "配色 CMF",
    hint: "锁定造型，只调整颜色、材质与表面工艺",
    applicationMode: "appearance-redesign",
    templateId: "premium-upgrade",
    localEdit: false,
  },
  {
    id: "sketch",
    label: "草图与结构",
    hint: "把手绘草图或内部堆叠转成结构可信的外观",
    applicationMode: "appearance-redesign",
    templateId: "functional-architecture",
    localEdit: false,
  },
  {
    id: "scene",
    label: "场景图",
    hint: "生成摄影棚产品图或商业使用场景",
    applicationMode: "product-kit",
    templateId: "detail-page-scene",
    localEdit: false,
  },
  {
    id: "retouch",
    label: "局部精修",
    hint: "只修改涂抹区域，其余保持原样",
    applicationMode: "appearance-redesign",
    templateId: "smart-auto",
    localEdit: true,
  },
  {
    id: "angles",
    label: "多角度",
    hint: "生成指定角度或商品多视图",
    applicationMode: "product-kit",
    templateId: "smart-auto",
    localEdit: false,
  },
  {
    id: "detail",
    label: "细节图",
    hint: "围绕功能、接口、材质与工艺做特写",
    applicationMode: "detail-page",
    templateId: "feature-detail",
    localEdit: false,
  },
  {
    id: "free",
    label: "自由对话",
    hint: "用自然语言说明要保留和要修改的内容",
    applicationMode: "appearance-redesign",
    templateId: "future-concept",
    localEdit: false,
  },
];

export function findWorkflow(id: string): TabletWorkflow {
  return TABLET_WORKFLOWS.find((item) => item.id === id) || TABLET_WORKFLOWS[0];
}
