// SPDX-License-Identifier: GPL-3.0-or-later

import {
  Compartment,
  Facet,
} from "@codemirror/state";
import type {
  CtnCompiledSyntax,
} from "../../core/ctn/index.ts";
import type {
  CtnEditorCheckableBlock,
} from "./ctnEditorCheckableBlocks.ts";
import { getCtnEditorCheckableProjection } from "./ctnEditorCheckableBlocks.ts";
import type {
  CtnEditorParsedContentMode,
} from "./ctnEditorContentMode.ts";

type CtnEditorRuntimeBaseOptions = {
  checkableBlocks: readonly CtnEditorCheckableBlock[];
  checkableBlocksKey?: string;
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

export type CtnEditorRuntimeConfig = Omit<CtnEditorRuntimeBaseOptions, "checkableBlocksKey"> & {
  checkableBlocksKey: string;
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
  const checkableBlocksKey = options.checkableBlocksKey ??
    getCtnEditorCheckableProjection(options.checkableBlocks).key;
  if (options.syntax === null) {
    return {
      ...options,
      checkableBlocksKey,
      analysisKey: "raw",
      presentationKey: "raw",
    };
  }

  return {
    ...options,
    checkableBlocksKey,
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
