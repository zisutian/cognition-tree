import { describe, expect, it } from "vitest";
import { createE2eTextPolicies } from "./e2eConstraintCatalog";
import {
  auditTextPolicies,
  type TextCorpus,
} from "../support/textPolicy";

const e2eSpecModules = import.meta.glob("../../e2e/*.pw.ts", {
  eager: true,
  import: "default",
  query: "?raw",
}) as TextCorpus;

describe("E2E boundaries", () => {
  it("loads the complete E2E policy corpus", () => {
    expect(Object.keys(e2eSpecModules).length).toBeGreaterThan(0);
  });

  it("enforces composition, isolation, and workflow policies", () => {
    expect(
      auditTextPolicies(createE2eTextPolicies(e2eSpecModules)),
    ).toEqual([]);
  });
});
