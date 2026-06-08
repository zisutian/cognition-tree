import type { CtnSyntaxProfile } from "../ctn/types";

export const defaultCtnSyntaxProfile = {
  id: "ctn-default",
  name: "默认 CTN 语法",
  version: 1,
  spaceIndentUnit: 4,
  markerRules: [
    { marker: "```", type: "code", label: "代码块" },
    { marker: ":", type: "definition", label: "定义" },
    { marker: ">", type: "personal-understanding", label: "理解" },
    { marker: "-", type: "component", label: "组分" },
  ],
} satisfies CtnSyntaxProfile;
