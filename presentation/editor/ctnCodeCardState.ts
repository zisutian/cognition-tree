// SPDX-License-Identifier: GPL-3.0-or-later

import { Annotation, StateEffect } from "@codemirror/state";

export type CtnCodeCardMode = "delete-confirm" | "editing" | "selected";

export type CtnCodeCardUiState = {
  lineNumber: number;
  mode: CtnCodeCardMode;
} | null;

export const setCtnCodeCardUiState =
  StateEffect.define<CtnCodeCardUiState>();

export const ctnCodeCardDocumentChange = Annotation.define<boolean>();
