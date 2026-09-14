import { Button, EmptyState, Panel } from "../../ui/index.ts";

export function SyntaxUnavailablePanel({
  featureName,
  onConfigureSyntax,
}: {
  featureName: string;
  onConfigureSyntax: () => void;
}) {
  return (
    <Panel aria-label={`${featureName}不可用`}>
      <EmptyState
        action={
          <Button onClick={onConfigureSyntax} type="button" variant="primary">
            打开语法
          </Button>
        }
        description="缺少语法配置"
        title={`${featureName}不可用`}
      />
    </Panel>
  );
}
