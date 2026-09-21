import {
  forwardRef,
  useContext,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { FormActions } from "compact-ui";
import { cx } from "./classNames.ts";
import styles from "./Page.module.css";
import {
  PageActionsHostContext,
  PageLayoutContext,
  type PageLayout,
} from "./PageLayout.ts";

/** Content composition only. Region headings and collapse actions belong to the frame. */
export function Page({
  actions,
  children,
  summary,
  kind = "content",
  ...props
}: Omit<HTMLAttributes<HTMLElement>, "className" | "style"> & {
  kind?: "content" | "editor" | "empty";
  actions?: ReactNode;
  summary?: ReactNode;
}) {
  const layout = useContext(PageLayoutContext);
  const actionsHost = useContext(PageActionsHostContext);
  const inlineActions = actionsHost ? null : actions;
  const reading = layout === "form" || layout === "conversation";
  const centered = layout === "conversation";
  return (
    <section
      {...props}
      className={cx(styles.page, kind === "editor" && "ctn-editor-panel")}
      data-page-kind={kind}
      data-page-fill={(layout !== "form" && layout !== "detail") || undefined}
    >
      {actionsHost && actions
        ? createPortal(<FormActions>{actions}</FormActions>, actionsHost)
        : null}
      {summary || inlineActions ? (
        <div
          className={cx(
            styles.toolbar,
            reading && styles.reading,
            centered && styles.centered,
          )}
          data-page-toolbar
        >
          {summary ? <div className={styles.summary}>{summary}</div> : null}
          {inlineActions ? (
            <div className={styles.actions}>{inlineActions}</div>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export type { PageLayout } from "./PageLayout.ts";

export const PageBody = forwardRef<
  HTMLDivElement,
  Omit<HTMLAttributes<HTMLDivElement>, "className" | "style"> & {
    layout?: PageLayout;
    scroll?: boolean;
  }
>(function PageBody(
  { children, layout = "detail", scroll = true, ...props },
  ref,
) {
  const regionLayout = useContext(PageLayoutContext) ?? layout;
  return (
    <div
      {...props}
      className={cx(
        styles.body,
        scroll &&
          regionLayout !== "form" &&
          regionLayout !== "detail" &&
          styles.scroll,
      )}
      data-page-layout={regionLayout}
      ref={ref}
    >
      <div className={cx(styles.content, styles[regionLayout])}>{children}</div>
    </div>
  );
});
