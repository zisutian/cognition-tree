import type {
  CtnSyntaxDraft,
} from "../../../core/ctn/syntax/draft";
import {
  ctnSyntaxSchema,
} from "../../../core/ctn/syntax/schema";
import type {
  CtnBlockKind,
  CtnSyntaxOwner,
  CtnSyntaxTone,
} from "../../../core/ctn/syntax/types";
import type { UiSyntaxFieldId } from "./viewSyntaxFields";

export type UiSyntaxTone = CtnSyntaxTone;

export type UiSyntaxToneOption = {
  label: string;
  value: UiSyntaxTone;
};

export type UiSyntaxKindOption = {
  label: string;
  value: CtnBlockKind;
};

export type UiSyntaxFocusTarget =
  | {
      fieldId: UiSyntaxFieldId;
      requestId: number;
      syntaxFileId: string;
    }
  | {
      fieldId: UiSyntaxFieldId;
      requestId: number;
      systemOwner: "journal" | "todo";
    };

export type UiSyntaxConstraints = {
  label: {
    maxLength: number;
  };
  name: {
    maxLength: number;
  };
  tabDisplayWidth: {
    max: number;
    min: number;
  };
  token: {
    maxCodePoints: number;
  };
};

export type UiSyntaxView = {
  backgroundToneOptions: UiSyntaxToneOption[];
  constraints: UiSyntaxConstraints;
  customToneLabel: string;
  draft: CtnSyntaxDraft | null;
  focusTarget: UiSyntaxFocusTarget | null;
  kindOptions: UiSyntaxKindOption[];
  owner: CtnSyntaxOwner;
  rootRuleLabel: string | null;
  rootTextColorOptions: UiSyntaxToneOption[];
  stats: {
    blockRuleCount: number;
    inlineRuleCount: number;
  };
  toneOptions: UiSyntaxToneOption[];
};

const kindLabels: Record<CtnBlockKind, string> = {
  line: "普通块",
  multiline: "多行块",
};

const syntaxKindOptions: UiSyntaxKindOption[] =
  ctnSyntaxSchema.blockKinds.map((value) => ({
    label: kindLabels[value],
    value,
  }));

const toneLabels: Record<(typeof ctnSyntaxSchema.tones)[number], string> = {
  amber: "琥珀",
  blue: "蓝色",
  cyan: "青色",
  gray: "灰色",
  green: "绿色",
  indigo: "靛蓝",
  pink: "粉色",
  red: "红色",
  teal: "青绿",
  violet: "紫色",
};

export const syntaxToneOptions: UiSyntaxToneOption[] =
  ctnSyntaxSchema.tones.map((tone) => ({
    label: toneLabels[tone],
    value: tone,
  }));

const backgroundSyntaxToneOptions: UiSyntaxToneOption[] = [
  { label: "编辑器背景", value: "default" },
  ...syntaxToneOptions,
];

const defaultTextColorOptions: UiSyntaxToneOption[] = [
  { label: "编辑器文字", value: "default" },
  ...syntaxToneOptions,
];

const syntaxConstraints: UiSyntaxConstraints = {
  label: {
    maxLength: ctnSyntaxSchema.label.maxLength,
  },
  name: {
    maxLength: ctnSyntaxSchema.name.maxLength,
  },
  tabDisplayWidth: {
    max: ctnSyntaxSchema.tabDisplayWidth.max,
    min: ctnSyntaxSchema.tabDisplayWidth.min,
  },
  token: {
    maxCodePoints: ctnSyntaxSchema.token.maxCodePoints,
  },
};

export function createUiSyntaxView<Draft extends CtnSyntaxDraft | null>({
  draft,
  focusTarget = null,
  owner = "workspace",
}: {
  draft: Draft;
  focusTarget?: UiSyntaxFocusTarget | null;
  owner?: CtnSyntaxOwner;
}): Omit<UiSyntaxView, "draft"> & { draft: Draft } {
  const rootSemanticId = ctnSyntaxSchema.owners[owner].root.semanticId;

  return {
    backgroundToneOptions: backgroundSyntaxToneOptions,
    constraints: syntaxConstraints,
    customToneLabel: "自定义",
    draft,
    focusTarget,
    kindOptions: syntaxKindOptions,
    owner,
    rootRuleLabel: rootSemanticId === "concept"
      ? "顶格概念"
      : rootSemanticId === "body"
        ? "顶格正文"
        : null,
    rootTextColorOptions: owner === "journal"
      ? defaultTextColorOptions
      : syntaxToneOptions,
    stats: {
      blockRuleCount: draft?.blocks.length ?? 0,
      inlineRuleCount: draft?.inline.length ?? 0,
    },
    toneOptions: syntaxToneOptions,
  };
}
