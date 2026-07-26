// SPDX-License-Identifier: GPL-3.0-or-later

import {
  Annotation,
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
import {
  createCtnMultilineSourceLayout,
  createCtnSourceLines,
  getCtnSourceLine,
  isClosedCtnMultilineBlock,
} from "../../core/ctn/editing/multilineBlockLayout";
import {
  createCtnSyntaxParseProfileKey,
} from "../../core/ctn/syntax/profileKey";
import type {
  CtnSyntaxProfile,
} from "../../core/ctn/syntax/types";
import {
  CtnMultilineCardEndWidget,
  CtnMultilineCardHeaderWidget,
} from "./ctnMultilineCardWidgets";
import {
  parseCtnEditorContent,
  type CtnEditorParsedContentMode,
} from "./ctnEditorContentMode";
import type {
  CtnEditorParsePlugin,
} from "./ctnDecorations";
import { ctnExternalValueSync } from "./editorValueSync";

type CtnMultilineProtectedRange = {
  from: number;
  kind: "body-prefix" | "fence" | "separator";
  to: number;
};

type CtnMultilineProtectionState = {
  profileKey: string;
  ranges: readonly CtnMultilineProtectedRange[];
};

export const ctnMultilineCardDocumentChange =
  Annotation.define<boolean>();

function createProtectionState(
  state: EditorState,
  syntaxProfile: CtnSyntaxProfile,
  contentMode: CtnEditorParsedContentMode,
): CtnMultilineProtectionState {
  const source = state.doc.toString();
  const document = parseCtnEditorContent(
    source,
    syntaxProfile,
    contentMode,
  );
  const ranges: CtnMultilineProtectedRange[] = [];
  const lines = createCtnSourceLines(source);

  for (const block of document.blocks) {
    if (!isClosedCtnMultilineBlock(block)) {
      continue;
    }
    const layout = createCtnMultilineSourceLayout(source, block);

    if (!layout?.closer) {
      continue;
    }
    const previousLine = getCtnSourceLine(
      lines,
      layout.opener.number - 1,
    );
    const nextLine = getCtnSourceLine(
      lines,
      layout.closer.number + 1,
    );

    ranges.push(
      {
        from: layout.opener.from,
        kind: "fence",
        to: layout.opener.to,
      },
      {
        from: layout.closer.from,
        kind: "fence",
        to: layout.closer.to,
      },
    );
    if (previousLine) {
      ranges.push({
        from: previousLine.to,
        kind: "separator",
        to: layout.opener.from,
      });
    }
    if (nextLine) {
      ranges.push({
        from: layout.closer.to,
        kind: "separator",
        to: nextLine.from,
      });
    }
    const firstBodyLine = layout.bodyLines[0];
    const lastBodyLine = layout.bodyLines.at(-1);

    if (firstBodyLine) {
      ranges.push({
        from: layout.opener.to,
        kind: "separator",
        to: firstBodyLine.from,
      });
    }
    if (lastBodyLine) {
      ranges.push({
        from: lastBodyLine.to,
        kind: "separator",
        to: layout.closer.from,
      });
    }
    for (const line of layout.bodyLines) {
      if (line.basePrefixLength > 0) {
        ranges.push({
          from: line.from,
          kind: "body-prefix",
          to: line.visibleFrom,
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
  return StateField.define<CtnMultilineProtectionState>({
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

function insertionTouchesRange(
  position: number,
  range: CtnMultilineProtectedRange,
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
  ranges: readonly CtnMultilineProtectedRange[],
) {
  if (from === to) {
    return ranges.some((range) =>
      insertionTouchesRange(from, range)
    );
  }

  return ranges.some((range) =>
    from < range.to && to > range.from
  );
}

function createDecorations(
  view: EditorView,
  parsePlugin: CtnEditorParsePlugin,
) {
  const parsed = view.plugin(parsePlugin);

  if (!parsed) {
    return {
      atomicRanges: Decoration.none,
      decorations: Decoration.none,
    };
  }
  const source = view.state.doc.toString();
  const activeLineNumber = view.state.doc.lineAt(
    view.state.selection.main.head,
  ).number;
  const decorations = [];
  const atomicRanges = [];

  for (const block of parsed.document.blocks) {
    if (!isClosedCtnMultilineBlock(block)) {
      continue;
    }
    const layout = createCtnMultilineSourceLayout(source, block);

    if (!layout?.closer) {
      continue;
    }
    const selected = activeLineNumber === block.lineNumber;
    const selectionClass = selected ? " is-selected" : "";
    const header = Decoration.replace({
      widget: new CtnMultilineCardHeaderWidget(block, selected),
    }).range(layout.opener.from, layout.opener.to);
    const end = Decoration.replace({
      widget: new CtnMultilineCardEndWidget(),
    }).range(layout.closer.from, layout.closer.to);

    decorations.push(
      Decoration.line({
        attributes: {
          class:
            `ctn-multiline-card-line ctn-multiline-card-start${selectionClass}`,
        },
      }).range(layout.opener.from),
      header,
      Decoration.line({
        attributes: {
          class:
            `ctn-multiline-card-line ctn-multiline-card-finish${selectionClass}`,
        },
      }).range(layout.closer.from),
      end,
    );
    atomicRanges.push(header, end);

    for (const line of layout.bodyLines) {
      decorations.push(
        Decoration.line({
          attributes: {
            class:
              `ctn-multiline-card-line ctn-multiline-card-body${selectionClass}`,
          },
        }).range(line.from),
      );
      if (line.basePrefixLength > 0) {
        const hiddenPrefix = Decoration.replace({}).range(
          line.from,
          line.visibleFrom,
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

export function createCtnMultilineCardExtensions(
  parsePlugin: CtnEditorParsePlugin,
  syntaxProfileRef: { current: CtnSyntaxProfile },
  contentMode: CtnEditorParsedContentMode,
): Extension[] {
  const protectionField = createProtectionField(
    syntaxProfileRef,
    contentMode,
  );
  const multilineCards = ViewPlugin.fromClass(
    class {
      atomicRanges: DecorationSet;
      decorations: DecorationSet;

      constructor(view: EditorView) {
        const built = createDecorations(view, parsePlugin);

        this.atomicRanges = built.atomicRanges;
        this.decorations = built.decorations;
      }

      update(update: ViewUpdate) {
        const built = createDecorations(
          update.view,
          parsePlugin,
        );

        this.atomicRanges = built.atomicRanges;
        this.decorations = built.decorations;
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );
  const protection = EditorState.transactionFilter.of(
    (transaction) => {
      if (
        !transaction.docChanged ||
        transaction.annotation(ctnMultilineCardDocumentChange) ||
        transaction.annotation(ctnExternalValueSync) ||
        transaction.isUserEvent("undo") ||
        transaction.isUserEvent("redo")
      ) {
        return transaction;
      }
      const ranges = transaction.startState
        .field(protectionField).ranges;
      let blocked = false;

      transaction.changes.iterChanges((from, to) => {
        if (changeTouchesProtectedRange(from, to, ranges)) {
          blocked = true;
        }
      });
      return blocked ? [] : transaction;
    },
  );

  return [
    protectionField,
    protection,
    multilineCards,
    EditorView.atomicRanges.of(
      (view) =>
        view.plugin(multilineCards)?.atomicRanges ?? Decoration.none,
    ),
  ];
}
