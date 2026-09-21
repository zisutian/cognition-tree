import { describe, expect, it } from "vitest";
import postcss from "postcss";
import { defaultDesignConfig } from "compact-ui";
import { uiConfig } from "../../presentation/ui/index";
import { uiVirtualRowHeightPx } from "../../presentation/ui/shared/virtualListMetrics";
import { defaultStructureTreeIndentWidthPx } from "../../presentation/ui/shared/tree/structureIndent";
import { presentationModules, sourceModules } from "./sourceCorpus";
import { auditTextPolicies, type TextCorpus } from "../support/textPolicy";
import { createUiTextPolicies } from "./uiConstraintCatalog";
const styleModules = import.meta.glob("../../presentation/**/*.css", {
  eager: true,
  import: "default",
  query: "?raw",
}) as TextCorpus;
const uiTestModules = import.meta.glob(
  ["../unit/presentation/**/*.test", "../unit/presentation/**/*.test.tsx"],
  { eager: true, import: "default", query: "?raw" },
) as TextCorpus;
describe("Compact UI ownership", () => {
  it("uses the released default configuration for all shared dimensions", () => {
    expect(uiConfig).toEqual(defaultDesignConfig);
    expect(uiVirtualRowHeightPx).toBe(uiConfig.metrics.rowHeight);
    expect(defaultStructureTreeIndentWidthPx).toBe(uiConfig.metrics.treeIndent);
  });
  it("loads public package CSS exactly once and forbids private imports", () => {
    const cssImports = Object.entries(presentationModules).filter(
      ([, source]) => source.includes('"compact-ui/styles.css"'),
    );
    expect(cssImports.map(([path]) => path)).toEqual([
      "../../presentation/shell/main.tsx",
    ]);
    const forbidden = Object.entries(sourceModules).filter(([, source]) =>
      /["']compact-ui\/(?!styles\.css["'])/.test(source),
    );
    expect(forbidden.map(([path]) => path)).toEqual([]);
    expect(presentationModules["../../presentation/shell/main.tsx"]).toContain(
      "<CompactProvider",
    );
    expect(presentationModules["../../presentation/ui/AppView.tsx"]).toContain(
      "<Workbench",
    );
  });
  it("keeps package variables read-only and never styles package internals", () => {
    const violations: string[] = [];
    for (const [file, source] of Object.entries(styleModules)) {
      const ast = postcss.parse(source, { from: file });
      ast.walkDecls((decl) => {
        if (decl.prop.startsWith("--cu-"))
          violations.push(`${file}: ${decl.prop}`);
      });
      ast.walkRules((rule) => {
        if (
          /:global|\.cu-|\[(?:data-cu|data-layout|data-tone|data-fill|data-direction)/.test(
            rule.selector,
          )
        )
          violations.push(`${file}: ${rule.selector}`);
      });
      ast.walkAtRules("design-tokens", () => {
        violations.push(`${file}: old theme generation`);
      });
    }
    expect(violations).toEqual([]);
  });
  it("keeps only content adapters in the application presentation layer", () => {
    expect(
      auditTextPolicies(
        createUiTextPolicies({
          presentationModules,
          sourceModules,
          styleModules,
          uiTestModules,
        }),
      ),
    ).toEqual([]);
    for (const legacy of [
      "AppFrame.tsx",
      "ActivityBar.tsx",
      "RegionFrame.tsx",
      "shared/Button.tsx",
      "shared/controls.tsx",
      "foundation/designTokens.ts",
    ])
      expect(
        presentationModules[`../../presentation/ui/${legacy}`],
      ).toBeUndefined();
  });
});
