export function SyntaxRuleHeader({
  kind,
}: {
  kind: "block" | "inline";
}) {
  const inline = kind === "inline";

  return (
    <div className="syntax-rule-row syntax-rule-header">
      <span>名称</span>
      <span>{inline ? "符号" : "标记"}</span>
      <span>类型</span>
      <span>{inline ? "颜色" : "背景"}</span>
      <span>{inline ? null : "颜色"}</span>
      <span />
    </div>
  );
}

export function SyntaxRuleSpacer() {
  return <span aria-hidden="true" className="syntax-rule-spacer" />;
}
