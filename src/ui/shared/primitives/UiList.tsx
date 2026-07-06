import type { HTMLAttributes } from "react";
import { cx } from "./classNames";

type UiListElement = "div" | "dl" | "ol" | "ul";
type UiListVariant = "plain" | "cards" | "definition" | "diagnostic";

type UiListProps = HTMLAttributes<HTMLElement> & {
  as?: UiListElement;
  scroll?: boolean;
  variant?: UiListVariant;
};

type UiListRowProps = HTMLAttributes<HTMLElement> & {
  as?: "div" | "li";
};

export function UiList({
  as = "ul",
  children,
  className,
  scroll = false,
  variant = "plain",
  ...props
}: UiListProps) {
  const listClassName = cx(
    "ui-list",
    variant !== "plain" && `ui-list-${variant}`,
    scroll && "ui-list-scroll",
    className,
  );

  if (as === "div") {
    return (
      <div className={listClassName} {...props}>
        {children}
      </div>
    );
  }

  if (as === "dl") {
    return (
      <dl className={listClassName} {...props}>
        {children}
      </dl>
    );
  }

  if (as === "ol") {
    return (
      <ol className={listClassName} {...props}>
        {children}
      </ol>
    );
  }

  return (
    <ul className={listClassName} {...props}>
      {children}
    </ul>
  );
}

export function UiListRow({
  as = "li",
  children,
  className,
  ...props
}: UiListRowProps) {
  const rowClassName = cx("ui-list-row", className);

  return as === "div" ? (
    <div className={rowClassName} {...props}>
      {children}
    </div>
  ) : (
    <li className={rowClassName} {...props}>
      {children}
    </li>
  );
}
