export default function TabletBrand({ splash = false }: { splash?: boolean }) {
  return (
    <div className={splash ? "tablet-brand tablet-brand-splash" : "tablet-brand"}>
      <b className="tablet-mark" aria-hidden="true">ID</b>
      <span>
        <strong>工业设计智能体</strong>
        <small>{splash ? "面向产品设计的 AI 批量外观改款工具" : "面向产品设计的 AI 批量外观改款工具"}</small>
      </span>
    </div>
  );
}
