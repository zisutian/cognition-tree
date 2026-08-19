// SPDX-License-Identifier: GPL-3.0-or-later

import {
  Compartment,
  Facet,
} from "@codemirror/state";
import type {
  CtnCompiledSyntax,
} from "../../core/ctn/syntax/types";
import type {
  CtnEditorCheckableBlock,
} from "./ctnEditorCheckableBlocks";
import type {
  CtnEditorParsedContentMode,
} from "./ctnEditorContentMode";

type CtnEditorRuntimeBaseOptions = {
  checkableBlocks: readonly CtnEditorCheckableBlock[];
};

export type CtnEditorRuntimeOptions = CtnEditorRuntimeBaseOptions & (
  | {
      contentMode: { kind: "raw" };
      syntax: null;
      tabDisplayWidth: number;
    }
  | {
      contentMode: CtnEditorParsedContentMode;
      syntax: CtnCompiledSyntax;
    }
);

export type CtnEditorRuntimeConfig = CtnEditorRuntimeBaseOptions & {
  analysisKey: string;
  presentationKey: string;
  tabDisplayWidth: number;
} & (
  | { contentMode: { kind: "raw" }; syntax: null }
  | { contentMode: CtnEditorParsedContentMode; syntax: CtnCompiledSyntax }
);

export const rawCtnEditorTabDisplayWidth = 8;

export const ctnEditorRuntimeCompartment = new Compartment();

export function createCtnEditorRuntimeConfig(
  options: CtnEditorRuntimeOptions,
): CtnEditorRuntimeConfig {
  if (options.syntax === null) {
    return {
      ...options,
      analysisKey: "raw",
      presentationKey: "raw",
    };
  }

  return {
    ...options,
    analysisKey: JSON.stringify({
      contentMode: options.contentMode,
      syntax: options.syntax.analysisKey,
    }),
    presentationKey: options.syntax.presentationKey,
    tabDisplayWidth: options.syntax.tabDisplayWidth,
  };
}

export const ctnEditorRuntimeConfigFacet = Facet.define<
  CtnEditorRuntimeConfig,
  CtnEditorRuntimeConfig | null
>({
  combine(configurations) {
    return configurations.at(-1) ?? null;
  },
});

export function requireCtnEditorRuntimeConfig(
  configuration: CtnEditorRuntimeConfig | null,
) {
  if (!configuration) {
    throw new Error("CTN editor runtime configuration is required.");
  }
  return configuration;
}
