import { useId, type HTMLAttributes, type ReactNode } from "react";
import { cx } from "./classNames.ts";
import styles from "./Section.module.css";

export function SectionStack({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cx(styles.stack, className)} />;
}

export function Section({
  actions,
  children,
  className,
  scroll = false,
  title,
  tone = "default",
  ...props
}: HTMLAttributes<HTMLElement> & {
  actions?: ReactNode;
  title?: ReactNode;
  tone?: "danger" | "default";
  scroll?: boolean;
}) {
  const headingId = useId();
  return (
    <section
      {...props}
      className={cx(styles.section, scroll && styles.scroll, className)}
      data-tone={tone}
      aria-labelledby={
        props["aria-labelledby"] ??
        (title && !props["aria-label"] ? headingId : undefined)
      }
    >
      {title || actions ? (
        <header className={styles.header}>
          {title ? (
            <h3 id={headingId} className={styles.title}>
              {title}
            </h3>
          ) : null}
          {actions ? <div className={styles.actions}>{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}
