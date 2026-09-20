import postcss from "postcss";
import { describe, expect, it } from "vitest";
import { designTokenStyles } from "../../../tooling/build/designTokenStyles";

const compile = (source: string) => postcss([designTokenStyles({
  tokens: { "--ui-row-height": "22px", "--ui-control-height": "var(--ui-row-height)" },
  breakpoints: { workbench: 1120, form: 360 },
})]).process(source, { from: undefined });

describe("design catalog CSS compilation", () => {
  it("emits root variables and expands both viewport and container queries", async () => {
    const result = await compile("@design-tokens; @media (max-width: design-breakpoint(workbench)) { .a { width: 100% } } @container (max-width: design-breakpoint(form)) { .b { display: block } }");
    expect(result.css).toContain("--ui-row-height: 22px");
    expect(result.css).toContain("--ui-control-height: var(--ui-row-height)");
    expect(result.css).toContain("@media (max-width: 1120px)");
    expect(result.css).toContain("@container (max-width: 360px)");
    expect(result.css).not.toContain("design-");
  });

  it("rejects unknown breakpoints instead of shipping an inactive responsive rule", async () => {
    await expect(compile("@media (max-width: design-breakpoint(typo)) {}"))
      .rejects.toThrow("Unknown design breakpoint: typo");
  });
});
