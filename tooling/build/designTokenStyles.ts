// SPDX-License-Identifier: GPL-3.0-or-later

import postcss, { type Plugin } from "postcss";

/** Compile the shared catalog into CSS without a second generated source file. */
export function designTokenStyles({
  tokens,
  breakpoints,
}: {
  tokens: Readonly<Record<string, string>>;
  breakpoints: Readonly<Record<string, number>>;
}): Plugin {
  return {
    postcssPlugin: "cognition-tree-design-tokens",
    AtRule(rule) {
      if (rule.name === "design-tokens") {
        if (rule.params || rule.nodes) {
          throw rule.error("Use @design-tokens; without arguments or a body.");
        }
        const root = postcss.rule({ selector: ":root" });
        root.source = rule.source;
        for (const [prop, value] of Object.entries(tokens)) {
          root.append(postcss.decl({ prop, value }));
        }
        rule.replaceWith(root);
      } else if (rule.name === "media" || rule.name === "container") {
        rule.params = rule.params.replace(
          /design-breakpoint\(([^)]+)\)/g,
          (_, name: string) => {
            const key = name.trim();
            if (!Object.prototype.hasOwnProperty.call(breakpoints, key)) {
              throw rule.error(`Unknown design breakpoint: ${key}`);
            }
            return `${breakpoints[key]}px`;
          },
        );
      }
    },
  };
}
