import {
  Button,
  Panel,
  PanelBody,
  PanelHeader,
  StatusLine,
} from "../../shared/primitives";

export function SyntaxSetupPanel({
  errorMessage,
  onConfigureSyntax,
  onUseDefaultSyntax,
}: {
  errorMessage: string;
  onConfigureSyntax: () => void;
  onUseDefaultSyntax: () => void;
}) {
  return (
    <Panel className="syntax-setup-panel" aria-label="仓库语法未配置">
      <PanelHeader title="仓库语法未配置" />
      <PanelBody>
        <p className="ui-muted">配置语法后可以解析笔记、结构操作和引用图谱。</p>
        {errorMessage ? <StatusLine tone="error">{errorMessage}</StatusLine> : null}
        <div className="ui-actions">
          <Button onClick={onConfigureSyntax} type="button" variant="primary">
            打开语法
          </Button>
          <Button onClick={onUseDefaultSyntax} type="button" variant="secondary">
            使用默认语法
          </Button>
        </div>
      </PanelBody>
    </Panel>
  );
}
