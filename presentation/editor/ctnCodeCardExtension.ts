// SPDX-License-Identifier: GPL-3.0-or-later

import {
  EditorState,
  StateField,
  type Extension,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { getCtnMultilineBodyBasePrefix } from
  "../../core/ctn/parser/multilineBlockEdits";
import { createCtnSyntaxParseProfileKey } from
  "../../core/ctn/syntax/profileKey";
import type { CtnSyntaxProfile } from "../../core/ctn/syntax/types";
import {
  isClosedMultilineBlock,
} from "./ctnCodeBlockCommands";
import {
  ctnCodeCardDocumentChange,
  setCtnCodeCardUiState,
  type CtnCodeCardUiState,
} from "./ctnCodeCardState";
import {
  CtnCodeCardEndWidget,
  CtnCodeCardHeaderWidget,
} from "./ctnCodeCardWidgets";
import {
  parseCtnEditorContent,
  type CtnEditorParsedContentMode,
} from "./ctnEditorContentMode";
import type { CtnEditorParsePlugin } from "./ctnDecorations";
import { ctnExternalValueSync } from "./editorValueSync";

type CtnCodeCardProtectedRange = {
  from: number;
  kind: "body-prefix" | "fence" | "separator";
  to: number;
};

type CtnCodeCardProtectionState = {
  profileKey: string;
  ranges: readonly CtnCodeCardProtectedRange[];
};

function createProtectionState(
  state: EditorState,
  syntaxProfile: CtnSyntaxProfile,
  contentMode: CtnEditorParsedContentMode,
): CtnCodeCardProtectionState {
  const document = parseCtnEditorContent(
    state.doc.toString(),
    syntaxProfile,
    contentMode,
  );
  const ranges: CtnCodeCardProtectedRange[] = [];

  for (const block of document.blocks) {
    if (!isClosedMultilineBlock(block)) {
      continue;
    }
    const opener = state.doc.line(block.lineNumber);
    const closer = state.doc.line(
      block.multilineRange.closingFenceLineNumber,
    );

    ranges.push(
      { from: opener.from, kind: "fence", to: opener.to },
      { from: closer.from, kind: "fence", to: closer.to },
    );
    if (opener.number < closer.number) {
      ranges.push(
        {
          from: opener.to,
          kind: "separator",
          to: state.doc.line(opener.number + 1).from,
        },
        {
          from: state.doc.line(closer.number - 1).to,
          kind: "separator",
          to: closer.from,
        },
      );
    }

    for (
      let lineNumber = block.multilineRange.contentStartLineNumber;
      lineNumber <= block.multilineRange.contentEndLineNumber;
      lineNumber += 1
    ) {
      const line = state.doc.line(lineNumber);
      const prefix = getCtnMultilineBodyBasePrefix(block, line.text);

      if (prefix) {
        ranges.push({
          from: line.from,
          kind: "body-prefix",
          to: line.from + prefix.length,
        });
      }
    }
  }

  return {
    profileKey: createCtnSyntaxParseProfileKey(syntaxProfile),
    ranges,
  };
}

function createProtectionField(
  syntaxProfileRef: { current: CtnSyntaxProfile },
  contentMode: CtnEditorParsedContentMode,
) {
  return StateField.define<CtnCodeCardProtectionState>({
    create(state) {
      return createProtectionState(
        state,
        syntaxProfileRef.current,
        contentMode,
      );
    },
    update(value, transaction) {
      const profileKey = createCtnSyntaxParseProfileKey(
        syntaxProfileRef.current,
      );

      return transaction.docChanged || value.profileKey !== profileKey
        ? createProtectionState(
            transaction.state,
            syntaxProfileRef.current,
            contentMode,
          )
        : value;
    },
  });
}

function createUiField(
  syntaxProfileRef: { current: CtnSyntaxProfile },
  contentMode: CtnEditorParsedContentMode,
) {
  return StateField.define<CtnCodeCardUiState>({
    create: () => null,
    update(value, transaction) {
      let next = value;
      let explicit = false;

      for (const effect of transaction.effects) {
        if (effect.is(setCtnCodeCardUiState)) {
          next = effect.value;
          explicit = true;
        }
      }
      if (!next || explicit ||
          (!transaction.docChanged && !transaction.selection)) {
        return next;
      }
      const document = parseCtnEditorContent(
        transaction.newDoc.toString(),
        syntaxProfileRef.current,
        contentMode,
      );
      const block = document.blocks.find(
        (candidate) =>
          candidate.lineNumber === next?.lineNumber &&
          isClosedMultilineBlock(candidate),
      );
      const activeLine = transaction.state.doc.lineAt(
        transaction.newSelection.main.head,
      ).number;

      return block &&
          activeLine >= block.lineNumber &&
          activeLine <= block.lexicalEndLineNumber
        ? next
        : null;
    },
  });
}

function insertionTouchesRange(
  position: number,
  range: CtnCodeCardProtectedRange,
) {
  if (range.kind === "fence") {
    return position >= range.from && position <= range.to;
  }
  if (range.kind === "body-prefix") {
    return position >= range.from && position < range.to;
  }
  return position > range.from && position < range.to;
}

function changeTouchesProtectedRange(
  from: number,
  to: number,
  ranges: readonly CtnCodeCardProtectedRange[],
) {
  if (from === to) {
    return ranges.some((range) => insertionTouchesRange(from, range));
  }
  return ranges.some((range) => from < range.to && to > range.from);
}

function createDecorations(
  view: EditorView,
  parsePlugin: CtnEditorParsePlugin,
  uiField: StateField<CtnCodeCardUiState>,
) {
  const parsed = view.plugin(parsePlugin);

  if (!parsed) {
    return {
      atomicRanges: Decoration.none,
      decorations: Decoration.none,
    };
  }
  const ui = view.state.field(uiField);
  const decorations = [];
  const atomicRanges = [];

  for (const block of parsed.document.blocks) {
    if (!isClosedMultilineBlock(block)) {
      continue;
    }
    const mode = ui?.lineNumber === block.lineNumber ? ui.mode : null;
    const opener = view.state.doc.line(block.lineNumber);
    const closer = view.state.doc.line(
      block.multilineRange.closingFenceLineNumber,
    );
    const header = Decoration.replace({
      widget: new CtnCodeCardHeaderWidget(block, mode),
    }).range(opener.from, opener.to);
    const end = Decoration.replace({
      widget: new CtnCodeCardEndWidget(),
    }).range(closer.from, closer.to);
    const selectionClass = mode ? " is-selected" : "";

    decorations.push(
      Decoration.line({
        attributes: {
          class: `ctn-code-card-line ctn-code-card-start${selectionClass}`,
        },
      }).range(opener.from),
      header,
      Decoration.line({
        attributes: {
          class: `ctn-code-card-line ctn-code-card-finish${selectionClass}`,
        },
      }).range(closer.from),
      end,
    );
    atomicRanges.push(header, end);

    for (
      let lineNumber = block.multilineRange.contentStartLineNumber;
      lineNumber <= block.multilineRange.contentEndLineNumber;
      lineNumber += 1
    ) {
      const line = view.state.doc.line(lineNumber);
      const prefix = getCtnMultilineBodyBasePrefix(block, line.text);

      decorations.push(
        Decoration.line({
          attributes: {
            class: `ctn-code-card-line ctn-code-card-body${selectionClass}`,
          },
        }).range(line.from),
      );
      if (prefix) {
        const hiddenPrefix = Decoration.replace({}).range(
          line.from,
          line.from + prefix.length,
        );

        decorations.push(hiddenPrefix);
        atomicRanges.push(hiddenPrefix);
      }
    }
  }

  return {
    atomicRanges: Decoration.set(atomicRanges, true),
    decorations: Decoration.set(decorations, true),
  };
}

export function createCtnCodeCardExtensions(
  parsePlugin: CtnEditorParsePlugin,
  syntaxProfileRef: { current: CtnSyntaxProfile },
  contentMode: CtnEditorParsedContentMode,
): {
  extensions: Extension[];
  uiField: StateField<CtnCodeCardUiState>;
} {
  const protectionField = createProtectionField(
    syntaxProfileRef,
    contentMode,
  );
  const uiField = createUiField(syntaxProfileRef, contentMode);
  const codeCards = ViewPlugin.fromClass(
    class {
      atomicRanges: DecorationSet;
      decorations: DecorationSet;

      constructor(view: EditorView) {
        const built = createDecorations(view, parsePlugin, uiField);

        this.atomicRanges = built.atomicRanges;
        this.decorations = built.decorations;
      }

      update(update: ViewUpdate) {
        const built = createDecorations(update.view, parsePlugin, uiField);

        this.atomicRanges = built.atomicRanges;
        this.decorations = built.decorations;
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );
  const protection = EditorState.transactionFilter.of((transaction) => {
    if (
      !transaction.docChanged ||
      transaction.annotation(ctnCodeCardDocumentChange) ||
      transaction.annotation(ctnExternalValueSync) ||
      transaction.isUserEvent("undo") ||
      transaction.isUserEvent("redo")
    ) {
      return transaction;
    }
    const ranges = transaction.startState.field(protectionField).ranges;
    let blocked = false;

    transaction.changes.iterChanges((from, to) => {
      if (changeTouchesProtectedRange(from, to, ranges)) {
        blocked = true;
      }
    });
    return blocked ? [] : transaction;
  });

  return {
    extensions: [
      protectionField,
      uiField,
      protection,
      codeCards,
      EditorView.atomicRanges.of(
        (view) => view.plugin(codeCards)?.atomicRanges ?? Decoration.none,
      ),
    ],
    uiField,
  };
}
