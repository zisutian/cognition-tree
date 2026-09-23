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
      "use current Compact UI controls without compatibility parameters",
      presentationModules,
      /\b(?:ContextList|ManagementList|ContextRow|ManagementRow|FrameButton|ContextRowProps|ManagementRowProps|FrameButtonProps|ColorControl|colorControlWidth)\b|\bvariant=|\bsizing="(?:content|container)"/,
    ),
    forbidTextPolicy(
      "syntax controls use package visuals; only preview content owns styles",
      presentationModules,
      /syntaxStyles|\.module\.css|\b(?:className|style)=/,
      /^presentation\/activities\/syntax\/(?!SyntaxDetailPanel\.tsx$).*\.tsx$/,
    ),
    forbidTextPolicy(
      "native generic controls are package-owned",
      presentationModules,
      /<(?:button|input|select|textarea)\b/,
    ),
    forbidTextPolicy(
      "all forms are rendered by the package",
      presentationModules,
      /<form\b/,
    ),
    forbidTextPolicy(
      "generic property and table markup is package-owned",
      presentationModules,
      /<(?:dl|table|fieldset|legend)\b/,
    ),
    forbidTextPolicy(
      "native browser dialogs",
      sourceModules,
      /window\.(?:alert|confirm|prompt)\s*\(/,
      /^presentation\//,
    ),
    forbidTextPolicy(
      "no retired design functions remain in runtime CSS",
      styleModules,
      /design-[a-z-]+\s*\(/,
    ),
    forbidTextPolicy(
      "old generic styles",
      styleModules,
      /\.ui-(?:button|input-control|checkbox-control|select-control|panel-header|empty-state)\b/,
    ),
    forbidTextPolicy(
      "visual colors come from Compact UI except CTN named content colors",
      styleModules,
      /#[\da-fA-F]{3,8}\b|\brgba?\(/,
      /^(?!presentation\/ui\/styles\/shared\/syntaxPalette\.css$).*\.css$/,
    ),
    forbidTextPolicy(
      "content typography uses framework values, not retired editor settings",
      styleModules,
      /--ctn-(?:editor-font-size|editor-line-height|numeric-variant|symbol-line-height|error-soft|link)\b|font-size:\s*[\d.]+px/,
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
