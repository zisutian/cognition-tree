import type { HTMLAttributes } from "react";
import { cx } from "./classNames";

type UiStatusTone = "error" | "success";

type UiStatusProps = HTMLAttributes<HTMLElement> & {
  tone: UiStatusTone;
};

export function UiStatus({
  children,
  className,
  tone,
  ...props
}: UiStatusProps) {
  return (
    <section className={cx("ui-status", `ui-status-${tone}`, className)} {...props}>
      {children}
    </section>
  );
}
