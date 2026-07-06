import type { ButtonHTMLAttributes } from "react";
import { cx } from "./classNames";

type UiButtonVariant = "primary" | "secondary" | "icon";

type UiButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: UiButtonVariant;
};

export function UiButton({
  className,
  variant = "secondary",
  ...props
}: UiButtonProps) {
  return (
    <button
      className={cx("ui-button", `ui-button-${variant}`, className)}
      {...props}
    />
  );
}
