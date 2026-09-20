import {
  forwardRef,
  useContext,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { cx } from "./classNames.ts";
import styles from "./Page.module.css";
import { PageLayoutContext, type PageLayout } from "./PageLayout.ts";

/** Content composition only. Region headings and collapse actions belong to the frame. */
export function Page({
  actions,
  children,
  footer,
  summary,
  kind = "content",
  ...props
}: Omit<HTMLAttributes<HTMLElement>, "className" | "style"> & {
  kind?: "content" | "editor" | "empty";
  actions?: ReactNode;
  footer?: ReactNode;
  summary?: ReactNode;
}) {
  const layout = useContext(PageLayoutContext);
  const reading = layout === "form" || layout === "conversation";
  const centered = layout === "conversation";
  return (
    <section
      {...props}
      className={cx(styles.page, kind === "editor" && "ctn-editor-panel")}
      data-page-kind={kind}
    >
      {summary || actions ? (
        <div
          className={cx(
            styles.toolbar,
            reading && styles.reading,
            centered && styles.centered,
          )}
          data-page-toolbar
        >
          {summary ? <div className={styles.summary}>{summary}</div> : null}
          {actions ? <div className={styles.actions}>{actions}</div> : null}
        </div>
      ) : null}
      {children}
      {footer ? (
        <div
          className={cx(
            styles.footer,
            reading && styles.reading,
            centered && styles.centered,
          )}
        >
          {footer}
        </div>
      ) : null}
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
      className={cx(styles.body, scroll && styles.scroll)}
      data-page-layout={regionLayout}
      ref={ref}
    >
      <div className={cx(styles.content, styles[regionLayout])}>{children}</div>
    </div>
  );
});
