import { Button } from "compact-ui";
import { RotateCcw } from "lucide-react";
import type { SyntaxViewModel } from "../../../application/syntax/index.ts";

/** Recovery stays visible while the rule list scrolls. The draft owns validity. */
export function SyntaxDraftStatus({ view }: { view: SyntaxViewModel }) {
  return (
    <Button onClick={view.revertInvalidChanges}>
      <RotateCcw aria-hidden="true" />
      撤销无效更改
    </Button>
  );
}
