// SPDX-License-Identifier: GPL-3.0-or-later

import {
  EditorState,
  StateField,
} from "@codemirror/state";
import {
  analyzeCtnSource,
  reprojectCtnAnalysisPresentation,
  type CtnEditableSourceAnalysis,
} from "../../core/ctn/index.ts";
import type {
  CtnEditorParsedContentMode,
} from "./ctnEditorContentMode.ts";
import {
  ctnEditorRuntimeConfigFacet,
  requireCtnEditorRuntimeConfig,
  type CtnEditorRuntimeConfig,
} from "./ctnEditorRuntime.ts";

export type CtnEditorAnalysisState = {
  analysis: CtnEditableSourceAnalysis | null;
  analysisKey: string;
  presentationKey: string;
};

export type CtnEditorAnalysisField =
  StateField<CtnEditorAnalysisState>;

function sourceMode(contentMode: CtnEditorParsedContentMode) {
  return contentMode.kind === "body"
    ? contentMode
    : { kind: "editable-document" as const };
}

function analyzeCtnEditorState(
  state: EditorState,
  configuration: CtnEditorRuntimeConfig = requireCtnEditorRuntimeConfig(
    state.facet(ctnEditorRuntimeConfigFacet),
  ),
): CtnEditorAnalysisState {
  const analysis = configuration.syntax === null
    ? null
    : analyzeCtnSource({
        mode: sourceMode(configuration.contentMode),
        source: state.doc.toString(),
        syntax: configuration.syntax,
      });

  return {
    analysis,
    analysisKey: configuration.analysisKey,
    presentationKey: configuration.presentationKey,
  };
}

export function createCtnEditorAnalysisField():
  CtnEditorAnalysisField {
  return StateField.define<CtnEditorAnalysisState>({
    create: analyzeCtnEditorState,
    update(value, transaction) {
      const configuration = requireCtnEditorRuntimeConfig(
        transaction.state.facet(ctnEditorRuntimeConfigFacet),
      );

      if (
        transaction.docChanged ||
        configuration.analysisKey !== value.analysisKey
      ) {
        return analyzeCtnEditorState(transaction.state, configuration);
      }
      if (
        configuration.syntax !== null &&
        configuration.presentationKey !== value.presentationKey
      ) {
        return {
          analysis: value.analysis
            ? reprojectCtnAnalysisPresentation(
                value.analysis,
                configuration.syntax,
              )
            : null,
          analysisKey: value.analysisKey,
          presentationKey: configuration.presentationKey,
        };
      }
      return value;
    },
  });
}
