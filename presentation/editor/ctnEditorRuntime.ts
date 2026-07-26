// SPDX-License-Identifier: GPL-3.0-or-later

import {
  Compartment,
  Facet,
} from "@codemirror/state";
import type {
  CtnCompiledSyntax,
} from "../../core/ctn/syntax/types";
import {
  defaultCtnSyntax,
} from "../../core/ctn/syntax/defaultSyntax";
import type {
  CtnEditorCheckableBlock,
} from "./ctnEditorCheckableBlocks";
import type {
  CtnEditorContentMode,
} from "./ctnEditorContentMode";

export type CtnEditorRuntimeOptions = {
  checkableBlocks: readonly CtnEditorCheckableBlock[];
  contentMode: CtnEditorContentMode;
  syntax: CtnCompiledSyntax;
};

export type CtnEditorRuntimeConfig =
  CtnEditorRuntimeOptions & {
    analysisKey: string;
    presentationKey: string;
  };

export const ctnEditorRuntimeCompartment = new Compartment();

export function createCtnEditorRuntimeConfig(
  options: CtnEditorRuntimeOptions,
): CtnEditorRuntimeConfig {
  return {
    ...options,
    analysisKey: JSON.stringify({
      contentMode: options.contentMode,
      syntax: options.syntax.analysisKey,
    }),
    presentationKey: options.syntax.presentationKey,
  };
}

const defaultCtnEditorRuntimeConfig = createCtnEditorRuntimeConfig({
  checkableBlocks: [],
  contentMode: { kind: "raw" },
  syntax: defaultCtnSyntax,
});

export const ctnEditorRuntimeConfigFacet = Facet.define<
  CtnEditorRuntimeConfig,
  CtnEditorRuntimeConfig
>({
  combine(configurations) {
    return configurations.at(-1) ??
      defaultCtnEditorRuntimeConfig;
  },
});
