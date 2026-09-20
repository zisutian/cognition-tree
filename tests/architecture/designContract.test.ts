import { describe, expect, it } from "vitest";
import postcss from "postcss";
import { designTokenStyles } from "../../tooling/build/designTokenStyles";
import { designTokens, designBreakpoints } from "../../presentation/ui/foundation/designTokens";
import { configurableSyntaxTones } from "../../core/ctn/syntax/tones";
import { defaultStructureTreeIndentWidthPx } from "../../presentation/ui/shared/tree/structureIndent";
import { uiVirtualRowHeightPx } from "../../presentation/ui/shared/virtualListMetrics";
import {
  appContextDefaultWidth,
  appDetailDefaultWidth,
  appProblemsDefaultHeight,
} from "../../presentation/ui/workbench/frameResize";
import { auditTextPolicies, type TextCorpus } from "../support/textPolicy";
import { presentationModules, sourceModules } from "./sourceCorpus";
import { readModuleImports } from "./moduleImports";
import {
  createUiConstraintCatalog,
  createUiTextPolicies,
} from "./uiConstraintCatalog";

const styleModules = import.meta.glob("../../presentation/**/*.css", {
  eager: true,
  import: "default",
  query: "?raw",
}) as TextCorpus;
const uiTestModules = import.meta.glob(
  ["../unit/presentation/**/*.test.ts", "../unit/presentation/**/*.test.tsx"],
  {
    eager: true,
    import: "default",
    query: "?raw",
  },
) as TextCorpus;
const uiConstraintCatalog = createUiConstraintCatalog({
  appContextDefaultWidth,
  appDetailDefaultWidth,
  appProblemsDefaultHeight,
  defaultStructureTreeIndentWidthPx,
  uiVirtualRowHeightPx,
});

function readStyle(relativePath: string) {
  return styleModules[`../../presentation/${relativePath}`] ?? "";
}

function readCustomProperties(source: string) {
  return new Map(
    [...source.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(
      (match) => [match[1] ?? "", match[2]?.trim() ?? ""] as const,
    ),
  );
}

describe("UI design contract", () => {
  it("keeps the design catalog dependency-free and shared dimensions owned by the foundation", () => {
    expect(readModuleImports(presentationModules, "../../presentation/ui/foundation/designTokens.ts")).toEqual([]);
    const violations: string[] = [];
    // These are component drawing details, not layout dimensions.
    const localGeometry = /^(?:\.ui-range-control::|\.ui-color-control$|\.ui-checkbox-control(?:::before)?$|\.ui-visually-hidden$)/;
    for (const [file, source] of Object.entries(styleModules)) {
      const ast = postcss.parse(source, { from: file });
      ast.walkAtRules(/^(media|container)$/, (rule) => {
        if (/\d+px/.test(rule.params)) violations.push(`${file}: literal responsive breakpoint`);
      });
      ast.walkDecls((decl) => {
        const selector = decl.parent?.type === "rule" ? decl.parent.selector : "";
        if (Object.prototype.hasOwnProperty.call(designTokens, decl.prop)) {
          const allowedOverride =
            (file.endsWith("/theme.css") && selector === ".source-editor" && decl.prop.startsWith("--color-accent")) ||
            (file.endsWith("/AppFrame.module.css") && decl.prop === "--app-status-bar-height" && selector === ".app-frame.is-focus-mode") ||
            (file.endsWith("/Popover.module.css") && decl.prop === "--ui-popover-width" && selector === ".compact");
          if (!allowedOverride) violations.push(`${file}: redeclares ${decl.prop}`);
        }
        if (file.includes("/ui/shared/") && /^(?:(?:min-|max-)?(?:height|width)|grid-template-columns|gap|(?:row-|column-)gap|padding(?:-.+)?|margin(?:-.+)?)$/.test(decl.prop) && /\d+px/.test(decl.value) && !localGeometry.test(selector)) {
          violations.push(`${file}: literal shared geometry in ${selector}: ${decl.prop}`);
        }
        if (/^(?:(?:min-|max-)?width|grid-template-columns)$/.test(decl.prop) && /var\(--ui-(?:row|control)-height\)/.test(decl.value)) {
          const squareControl =
            (file.endsWith("/Button.module.css") && selector === ".ui-button-icon") ||
            (file.endsWith("/Controls.module.css") && selector === ".ui-color-control") ||
            (file.endsWith("/structure.module.css") && selector === ".structure-operation-grid") ||
            (file.endsWith("/syntax.module.css") && [".syntax-rule-row", ".syntax-tone-custom-row"].includes(selector));
          if (!squareControl) violations.push(`${file}: horizontal layout depends on row height`);
        }
      });
    }
    expect(violations).toEqual([]);
  });
  it("keeps style layers explicit and Activity CSS owned by its view", () => {
    const uiStylePaths = Object.keys(styleModules)
      .filter((path) => path.startsWith("../../presentation/ui/"))
      .map((path) => path.replace("../../presentation/", ""));
    const globalStyleEntry = readStyle("ui/styles/index.css");
    expect(
      uiConstraintCatalog.requiredStyleLayers.filter(
        (path) => !uiStylePaths.includes(path),
      ),
    ).toEqual([]);
    expect(globalStyleEntry).not.toContain("./activities/");
    expect(globalStyleEntry.match(/@import[^;]+;/g)).toEqual([
      '@import "./foundation/theme.css";',
      '@import "./foundation/base.css";',
      '@import "./shared/blockText.css";',
    ]);
  });

  it("enforces the declared source-level UI policies", () => {
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
  });

  it("compiles the shared design vocabulary and runtime dimensions from one catalog", async () => {
    const theme = readStyle("ui/styles/foundation/theme.css");
    const compiled = await postcss([designTokenStyles({ tokens: designTokens, breakpoints: designBreakpoints })]).process(theme, { from: undefined });
    const themeProperties = readCustomProperties(compiled.css);
    const blockTextStyle = readStyle("ui/styles/shared/blockText.css");
    const missingToneSelectors = configurableSyntaxTones
      .flatMap((tone) => [`.ctn-tone-${tone}`, `.ctn-text-color-${tone}`])
      .filter((selector) => !blockTextStyle.includes(selector));

    expect(
      uiConstraintCatalog.requiredThemeTokens.filter(
        (token) => !themeProperties.has(token),
      ),
    ).toEqual([]);
    expect(
      uiConstraintCatalog.runtimeDimensions.map(([token, expected]) => [
        token,
        themeProperties.get(token),
        expected,
      ]),
    ).toEqual(
      uiConstraintCatalog.runtimeDimensions.map(([token, expected]) => [
        token,
        expected,
        expected,
      ]),
    );
    expect(missingToneSelectors).toEqual([]);
  });
});
