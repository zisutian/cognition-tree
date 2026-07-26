// SPDX-License-Identifier: GPL-3.0-or-later

import {
  EditorState,
  StateField,
} from "@codemirror/state";
import {
  analyzeCtnSource,
  reprojectCtnAnalysisPresentation,
  type CtnEditableSourceAnalysis,
} from "../../core/ctn/analysis/sourceAnalysis";
import type {
  CtnEditorParsedContentMode,
} from "./ctnEditorContentMode";
import {
  ctnEditorRuntimeConfigFacet,
  type CtnEditorRuntimeConfig,
} from "./ctnEditorRuntime";

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
  configuration: CtnEditorRuntimeConfig = state.facet(
    ctnEditorRuntimeConfigFacet,
  ),
): CtnEditorAnalysisState {
  const analysis = configuration.contentMode.kind === "raw"
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
      const configuration = transaction.state.facet(
        ctnEditorRuntimeConfigFacet,
      );

      if (
        transaction.docChanged ||
        configuration.analysisKey !== value.analysisKey
      ) {
        return analyzeCtnEditorState(transaction.state, configuration);
      }
      if (configuration.presentationKey !== value.presentationKey) {
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
