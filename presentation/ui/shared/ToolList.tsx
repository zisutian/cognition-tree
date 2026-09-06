// SPDX-License-Identifier: GPL-3.0-or-later

import type { ButtonHTMLAttributes, HTMLAttributes, LiHTMLAttributes, ReactNode } from "react";
import { cx } from "./primitives.tsx";

export function ToolList({
  className,
  ...props
}: HTMLAttributes<HTMLUListElement>) {
  return <ul className={cx("ui-tool-list", className)} {...props} />;
}

type ToolListRowButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "className" | "onClick" | "type"
> & {
  [attribute: `data-${string}`]: string | number | undefined;
};

type ToolListRowCommonProps = Omit<
  LiHTMLAttributes<HTMLLIElement>,
  "children" | "onSelect"
> & {
  actions?: ReactNode;
  flow: "single-line" | "wrap";
  leading?: ReactNode;
  main: ReactNode;
  meta?: ReactNode;
};

type ToolListRowInteractionProps =
  | {
    buttonProps?: ToolListRowButtonProps;
    onSelect: () => void;
  }
  | {
    buttonProps?: never;
    onSelect?: never;
  };

export function ToolListRow({
  actions,
  buttonProps,
  className,
  flow,
  leading,
  main,
  meta,
  onSelect,
  ...props
}: ToolListRowCommonProps & ToolListRowInteractionProps) {
  const content = (
    <>
      <span className="ui-tool-list-row-leading">{leading}</span>
      <span className="ui-tool-list-row-main">{main}</span>
      <span className="ui-tool-list-row-meta">{meta}</span>
    </>
  );

  return (
    <li
      className={cx(
        "ui-tool-list-row-frame",
        `ui-tool-list-row-${flow}`,
        className,
      )}
      {...props}
    >
      {onSelect ? (
        <button
          className="ui-tool-list-row-target is-interactive"
          onClick={onSelect}
          type="button"
          {...buttonProps}
        >
          {content}
        </button>
      ) : (
        <div className="ui-tool-list-row-target">{content}</div>
      )}
      {actions ? (
        <div className="ui-tool-list-row-actions">{actions}</div>
      ) : null}
    </li>
  );
}
