import {
  forbidTextPolicy,
  type TextCorpus,
  type TextPolicy,
} from "../support/textPolicy";
import { createWorkflowTextPolicies } from "../support/workflowTextPolicies";

export function createE2eTextPolicies(
  e2eSpecModules: TextCorpus,
): readonly TextPolicy[] {
  return [
    {
      allowedPath: /^e2e\/.+\.pw\.ts$/,
      corpus: e2eSpecModules,
      matches: Object.keys(e2eSpecModules).length,
      name: "E2E composition-root fixture",
      pattern: /from "\.\/support\/e2eTest"/,
    },
    forbidTextPolicy(
      "order-dependent E2E suites",
      e2eSpecModules,
      /\b(?:describe\.serial|beforeAll|afterAll)\s*\(/,
    ),
    forbidTextPolicy(
      "direct built-in resets in E2E specs",
      e2eSpecModules,
      /\breset(?:Journal|Todo)Repository\s*\(/,
    ),
    ...createWorkflowTextPolicies(e2eSpecModules),
  ];
}
