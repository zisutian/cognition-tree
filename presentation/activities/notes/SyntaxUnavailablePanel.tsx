import { Button, EmptyState, Page } from "../../ui/index.ts";

export function SyntaxUnavailablePanel({
  featureName,
  onConfigureSyntax,
}: {
  featureName: string;
  onConfigureSyntax: () => void;
}) {
  return (
    <Page aria-label={`${featureName}不可用`}>
      <EmptyState
        action={
          <Button onClick={onConfigureSyntax} type="button" variant="primary">
            打开语法
          </Button>
        }
        description="缺少语法配置"
        title={`${featureName}不可用`}
      />
    </Page>
  );
}
