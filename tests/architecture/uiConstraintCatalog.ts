import {
  forbidTextPolicy,
  type TextCorpus,
  type TextPolicy,
} from "../support/textPolicy";
import { createWorkflowTextPolicies } from "../support/workflowTextPolicies";
export function createUiTextPolicies({
  presentationModules,
  sourceModules,
  styleModules,
  uiTestModules,
}: {
  presentationModules: TextCorpus;
  sourceModules: TextCorpus;
  styleModules: TextCorpus;
  uiTestModules: TextCorpus;
}): readonly TextPolicy[] {
  return [
    forbidTextPolicy(
      "native generic controls are package-owned",
      presentationModules,
      /<(?:button|input|select|textarea)\b/,
    ),
    forbidTextPolicy(
      "native browser dialogs",
      sourceModules,
      /window\.(?:alert|confirm|prompt)\s*\(/,
      /^presentation\//,
    ),
    forbidTextPolicy(
      "old generic styles",
      styleModules,
      /\.ui-(?:button|input-control|checkbox-control|select-control|panel-header|empty-state)\b/,
    ),
    forbidTextPolicy(
      "Activity styles cannot own shared classes",
      styleModules,
      /\.ui-[\w-]/m,
      /^presentation\/activities\/.*\.css$/,
    ),
    forbidTextPolicy(
      "Activity styles cannot reach into controls",
      styleModules,
      /[ >](?:button|input|select|textarea|label)(?:[:\[.# >]|\s*\{)/m,
      /^presentation\/activities\/.*\.css$/,
    ),
    forbidTextPolicy(
      "editor styles remain editor-owned",
      styleModules,
      /\.source-editor/,
      /^presentation\/activities\/.*\.css$/,
    ),
    ...createWorkflowTextPolicies(uiTestModules),
  ];
}
