import { Button, EmptyState, Panel } from "./shared/primitives.tsx";

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
        description="当前仓库没有语法配置。笔记原文仍可在笔记活动中编辑。"
        title={`${featureName}不可用`}
      />
    </Panel>
  );
}
