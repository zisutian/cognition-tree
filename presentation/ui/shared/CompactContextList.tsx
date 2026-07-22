// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  KeyboardEvent,
  LiHTMLAttributes,
  MouseEvent,
  ReactNode,
} from "react";
import { cx } from "./primitives";

export type CompactContextInlineRename = {
  ariaLabel: string;
  disabled?: boolean;
  inputProps?: Omit<
    InputHTMLAttributes<HTMLInputElement>,
    | "aria-label"
    | "autoFocus"
    | "className"
    | "disabled"
    | "onBlur"
    | "onChange"
    | "onKeyDown"
    | "value"
  >;
  onBlur?: () => void;
  onCancel: () => void;
  onChange: (value: string) => void;
  onSubmit: () => void;
  value: string;
};

export type CompactContextListProps = HTMLAttributes<HTMLUListElement>;

export function CompactContextList({
  className,
  ...props
}: CompactContextListProps) {
  return (
    <ul
      className={cx("ui-tree ui-compact-context-list", className)}
      {...props}
    />
  );
}

export type CompactContextGroupProps = {
  children: ReactNode;
  className?: string;
  count?: number;
  headingId: string;
  label: ReactNode;
  listAriaLabel?: string;
  listClassName?: string;
};

export function CompactContextGroup({
  children,
  className,
  count,
  headingId,
  label,
  listAriaLabel,
  listClassName,
}: CompactContextGroupProps) {
  return (
    <section
      aria-labelledby={headingId}
      className={cx("ui-compact-context-group", className)}
    >
      <h3 className="ui-compact-context-group-title" id={headingId}>
        <span>{label}</span>
        {count === undefined ? null : <span>{count}</span>}
      </h3>
      <CompactContextList
        aria-label={listAriaLabel}
        className={listClassName}
      >
        {children}
      </CompactContextList>
    </section>
  );
}

export type CompactContextRowButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  | "aria-current"
  | "children"
  | "className"
  | "disabled"
  | "onClick"
  | "title"
  | "type"
> & {
  [attribute: `data-${string}`]: string | number | undefined;
};

export type CompactContextRowFrameProps = Omit<
  LiHTMLAttributes<HTMLLIElement>,
  "children" | "className"
> & {
  [attribute: `data-${string}`]: string | number | undefined;
};

export type CompactContextStaticContentProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  "children" | "className" | "role" | "tabIndex"
> & {
  [attribute: `data-${string}`]: string | number | undefined;
};

export type CompactContextStaticRowProps = {
  children: ReactNode;
  className?: string;
  compact?: boolean;
  contentClassName?: string;
  contentProps?: CompactContextStaticContentProps;
  rowProps?: CompactContextRowFrameProps;
};

export function CompactContextStaticRow({
  children,
  className,
  compact = true,
  contentClassName,
  contentProps,
  rowProps,
}: CompactContextStaticRowProps) {
  return (
    <li
      {...rowProps}
      className={cx(
        "ui-tree-row-frame ui-compact-context-row-frame",
        className,
      )}
    >
      <div
        {...contentProps}
        className={cx(
          compact && "ui-tree-row ui-compact-context-row",
          "ui-compact-context-static-row",
          contentClassName,
        )}
        role="group"
        tabIndex={-1}
      >
        {children}
      </div>
    </li>
  );
}

export type CompactContextRowProps = {
  actions?: ReactNode;
  buttonProps?: CompactContextRowButtonProps;
  className?: string;
  disabled?: boolean;
  icon: ReactNode;
  inlineRename?: CompactContextInlineRename;
  label: ReactNode;
  onBeginRename?: () => void;
  onSelect: () => void;
  rowProps?: CompactContextRowFrameProps;
  rowClassName?: string;
  selected?: boolean;
  title?: string;
  trailing?: ReactNode;
};

export function CompactContextRow({
  actions,
  buttonProps,
  className,
  disabled = false,
  icon,
  inlineRename,
  label,
  onBeginRename,
  onSelect,
  rowProps,
  rowClassName,
  selected = false,
  title,
  trailing,
}: CompactContextRowProps) {
  const beginRenameFromDoubleClick = (event: MouseEvent<HTMLButtonElement>) => {
    buttonProps?.onDoubleClick?.(event);
    if (!event.defaultPrevented) {
      onBeginRename?.();
    }
  };
  const beginRenameFromKeyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
    buttonProps?.onKeyDown?.(event);
    if (!event.defaultPrevented && event.key === "F2" && onBeginRename) {
      event.preventDefault();
      onBeginRename();
    }
  };

  return (
    <li
      {...rowProps}
      className={cx(
        "ui-tree-row-frame ui-compact-context-row-frame",
        selected && "is-selected",
        inlineRename && "is-editing",
        className,
      )}
    >
      {inlineRename ? (
        <form
          className="ui-compact-context-inline-rename"
          onSubmit={(event) => {
            event.preventDefault();
            inlineRename.onSubmit();
          }}
        >
          {icon}
          <input
            {...inlineRename.inputProps}
            aria-label={inlineRename.ariaLabel}
            autoFocus
            className="ui-input ui-input-tree"
            disabled={inlineRename.disabled}
            onBlur={inlineRename.onBlur}
            onChange={(event) => inlineRename.onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                inlineRename.onCancel();
              }
            }}
            value={inlineRename.value}
          />
        </form>
      ) : (
        <button
          {...buttonProps}
          aria-current={selected ? "page" : undefined}
          className={cx(
            "ui-tree-row ui-compact-context-row",
            selected && "is-selected",
            rowClassName,
          )}
          disabled={disabled}
          onClick={onSelect}
          onDoubleClick={beginRenameFromDoubleClick}
          onKeyDown={beginRenameFromKeyboard}
          title={title}
          type="button"
        >
          {icon}
          <span className="ui-tree-text">{label}</span>
          {trailing}
        </button>
      )}
      {actions && !inlineRename ? (
        <span className="ui-tree-actions">{actions}</span>
      ) : null}
    </li>
  );
}
