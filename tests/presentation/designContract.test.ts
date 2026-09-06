import { describe, expect, it } from "vitest";
import { configurableSyntaxTones } from "../../core/ctn/syntax/tones";
import { defaultStructureTreeIndentWidthPx } from "../../presentation/ui/shared/tree/structureIndent";
import { uiVirtualRowHeightPx } from "../../presentation/ui/shared/virtualListMetrics";
import {
  appContextDefaultWidth,
  appDetailDefaultWidth,
  appProblemsDefaultHeight,
} from "../../presentation/ui/workbench/frameResize";
import { auditTextPolicies, type TextCorpus } from "../support/textPolicy";
import {
  createUiTextPolicies,
  createUiConstraintCatalog,
} from "./uiConstraintCatalog";
import {
  presentationModules,
  sourceModules,
} from "../architecture/sourceCorpus";

const styleModules = import.meta.glob("../../presentation/**/*.css", {
  eager: true,
  import: "default",
  query: "?raw",
}) as TextCorpus;
const uiTestModules = import.meta.glob(["./**/*.test.ts", "./**/*.test.tsx"], {
  eager: true,
  import: "default",
  query: "?raw",
}) as TextCorpus;
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
  it("keeps style layers explicit and Activity CSS owned by its view", () => {
    const uiStylePaths = Object.keys(styleModules)
      .filter((path) => path.startsWith("../../presentation/ui/styles"))
      .map((path) => path.replace("../../presentation/", ""));
    const globalStyleEntry = readStyle("ui/styles/index.css");
    expect(
      uiConstraintCatalog.requiredStyleLayers.filter(
        (path) => !uiStylePaths.includes(path),
      ),
    ).toEqual([]);
    expect(globalStyleEntry).not.toContain("./activities/");
    expect(globalStyleEntry).toContain("./frame/problems.css");
    expect(globalStyleEntry).toContain("./shared/toolPanel.css");
    expect(globalStyleEntry).toContain("./shared/controls.css");
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

  it("centralizes the complete design vocabulary and runtime dimensions", () => {
    const theme = readStyle("ui/styles/foundation/theme.css");
    const themeProperties = readCustomProperties(theme);
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
