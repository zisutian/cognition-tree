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
  kind = "content",
  ...props
}: Omit<HTMLAttributes<HTMLElement>, "className" | "style"> & {
  kind?: "content" | "editor" | "empty";
  actions?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section
      {...props}
      className={cx(styles.page, kind === "editor" && "ctn-editor-panel")}
      data-page-kind={kind}
    >
      {actions ? <div className={styles.toolbar}>{actions}</div> : null}
      {children}
      {footer ? <div className={styles.footer}>{footer}</div> : null}
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
