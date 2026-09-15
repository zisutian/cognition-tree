import type { ReactNode } from "react";
import { Page } from "../ui/index.ts";

export function CtnEditorPanel({
  ariaLabel,
  children,
}: {
  ariaLabel: string;
  children: ReactNode;
}) {
  return (
    <Page aria-label={ariaLabel} kind="editor">
      {children}
    </Page>
  );
}
