import { forwardRef, type ButtonHTMLAttributes } from "react";
import buttonStyles from "./Button.module.css";
import { cx } from "./classNames.ts";
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?:
    | "activity"
    | "bare"
    | "danger"
    | "ghost"
    | "icon"
    | "primary"
    | "secondary"
    | "selection";
  sizing?: "container" | "content";
  density?: "list" | "normal";
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      className,
      density = "normal",
      variant = "secondary",
      sizing = "content",
      ...props
    },
    ref,
  ) {
    return (
      <button
        data-density={density}
        className={cx(
          "ui-button",
          variant !== "bare" && buttonStyles["ui-button"],
          buttonStyles[`ui-button-${variant}`],
          sizing === "container" && buttonStyles["ui-button-container"],
          `ui-button-${variant}`,
          sizing === "container" && "ui-button-container",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);

export function ToggleButton({
  className,
  pressed,
  ...props
}: Omit<ButtonProps, "aria-pressed" | "variant"> & {
  pressed: boolean;
}) {
  return (
    <Button
      variant="selection"
      aria-pressed={pressed}
      className={cx(className)}
      type="button"
      {...props}
    />
  );
}
