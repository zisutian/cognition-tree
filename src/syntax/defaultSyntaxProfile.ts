import type { CtnSyntaxProfile } from "./types";

export const defaultCtnSyntaxProfile = {
  id: "ctn-default",
  name: "默认 CTN 语法",
  version: 1,
  spaceIndentUnit: 4,
  markerRules: [
    { marker: "```", type: "code", label: "代码块", role: "code", tone: "code" },
    {
      marker: ":",
      type: "definition",
      label: "定义",
      role: "normal",
      tone: "green",
    },
    {
      marker: ">",
      type: "personal-understanding",
      label: "理解",
      role: "normal",
      tone: "green",
    },
    {
      marker: "-",
      type: "component",
      label: "组分",
      role: "normal",
      tone: "blue",
    },
  ],
  inlineRules: [
    {
      close: "`",
      kind: "paired",
      label: "行内代码",
      open: "`",
      tone: "code",
      type: "inline-code",
    },
    {
      close: ">",
      kind: "paired",
      label: "局部概念引用",
      open: "<",
      tone: "green",
      type: "local-reference",
    },
    {
      close: "]]",
      kind: "paired",
      label: "全局概念引用",
      open: "[[",
      tone: "blue",
      type: "global-reference",
    },
    {
      kind: "single",
      label: "并列分隔",
      marker: "\\",
      tone: "amber",
      type: "parallel-separator",
    },
  ],
} satisfies CtnSyntaxProfile;
