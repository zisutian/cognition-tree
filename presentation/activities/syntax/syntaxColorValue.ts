import type { SyntaxTone } from "../../../application/syntax/index.ts";
import { isCustomTone } from "../../ui/index.ts";

export function syntaxToneColor(
  tone: SyntaxTone,
  channel: "background" | "text",
) {
  if (isCustomTone(tone)) return tone;
  if (tone === "default")
    return channel === "background"
      ? "var(--cu-color-surface)"
      : "var(--cu-color-foreground)";
  return `var(--ctn-tone-${tone})`;
}

/** The picker accepts CSS colors; persisted CTN custom colors are opaque sRGB hex. */
export function customSyntaxColor(color: string): SyntaxTone {
  const value = color.trim();
  if (isCustomTone(value)) return value.toLowerCase() as SyntaxTone;
  const unsupported = () => {
    throw new Error(
      "语法颜色仅支持不透明的固定色值，请选择预设色或输入如 #123456 的颜色。",
    );
  };
  if (
    /^(?:currentcolor|inherit|initial|unset|revert(?:-layer)?)$/i.test(value) ||
    /\b(?:var|env)\s*\(/i.test(value)
  )
    return unsupported();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d");
  if (!context) return unsupported();
  // Invalid canvas colors leave fillStyle unchanged; two sentinels distinguish them.
  context.fillStyle = "#000000";
  context.fillStyle = value;
  const parsed = context.fillStyle;
  context.fillStyle = "#ffffff";
  context.fillStyle = value;
  if (context.fillStyle !== parsed) return unsupported();
  context.fillRect(0, 0, 1, 1);
  const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
  if (alpha !== 255) return unsupported();
  return `#${[red, green, blue].map((part) => part.toString(16).padStart(2, "0")).join("")}`;
}
