import {
  forbidTextPolicy,
  type TextCorpus,
  type TextPolicy,
} from "./textPolicy";

const workflowTestScope = (filePath: string) =>
  !filePath.endsWith("designContract.test.ts");

export function createWorkflowTextPolicies(
  corpus: TextCorpus,
): readonly TextPolicy[] {
  return ([
    ["class matcher in workflow tests", /\.toHaveClass\s*\(/],
    ["CSS matcher in workflow tests", /\.toHaveCSS\s*\(/],
    ["className inspection in workflow tests", /\.props\.className\b/],
    ["unsafe markup order comparison", /\b\w*[Mm]arkup\.indexOf\s*\(/],
  ] as const).map(([name, pattern]) =>
    forbidTextPolicy(name, corpus, pattern, workflowTestScope)
  );
}
