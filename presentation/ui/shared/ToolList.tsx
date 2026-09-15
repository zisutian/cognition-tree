import managementListStyles from "./ManagementList.module.css";
import toolListStyles from "./ToolList.module.css";
import { createClassNames } from "./classNames.ts";
const cx = createClassNames(toolListStyles, managementListStyles);
// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  LiHTMLAttributes,
  ReactNode,
} from "react";
import { Button } from "./Button.tsx";

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
      <span className={cx("ui-tool-list-row-leading")}>{leading}</span>
      <span className={cx("ui-tool-list-row-main")}>{main}</span>
      <span className={cx("ui-tool-list-row-meta")}>{meta}</span>
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
        <Button
          variant="bare"
          className={cx("ui-tool-list-row-target is-interactive")}
          onClick={onSelect}
          type="button"
          {...buttonProps}
        >
          {content}
        </Button>
      ) : (
        <div className={cx("ui-tool-list-row-target")}>{content}</div>
      )}
      {actions ? (
        <div className={cx("ui-tool-list-row-actions")}>{actions}</div>
      ) : null}
    </li>
  );
}
