// SPDX-License-Identifier: GPL-3.0-or-later

import {
  Annotation,
  EditorState,
  Prec,
  StateEffect,
  StateField,
  type ChangeSpec,
  type TransactionSpec,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  keymap,
  type DecorationSet,
} from "@codemirror/view";
import {
  createCtnMultilineStructuralIndentEdits,
  getCtnMultilineBodyBasePrefix,
  type CtnMultilineIndentDirection,
} from "../../core/ctn/parser/multilineBlockEdits";
import type {
  CtnClosedMultilineRange,
  CtnEditableBlock,
  CtnEditableDocument,
} from "../../core/ctn/parser/types";
import { createCtnSyntaxParseProfileKey } from
  "../../core/ctn/syntax/profileKey";
import type { CtnSyntaxProfile } from "../../core/ctn/syntax/types";
import {
  parseCtnEditorContent,
  type CtnEditorParsedContentMode,
} from "./ctnEditorContentMode";
import type { CtnEditorParsePlugin } from "./ctnDecorations";
import { ctnExternalValueSync } from "./editorValueSync";

type CtnCodeCardMode = "delete-confirm" | "editing" | "selected";

type CtnCodeCardUiState = {
  lineNumber: number;
  mode: CtnCodeCardMode;
} | null;

type CtnCodeCardProtectedRange = {
  from: number;
  kind: "body-prefix" | "fence" | "separator";
  to: number;
};

type CtnCodeCardProtectionState = {
  profileKey: string;
  ranges: readonly CtnCodeCardProtectedRange[];
};

const setCtnCodeCardUiState = StateEffect.define<CtnCodeCardUiState>();
const ctnCodeCardDocumentChange = Annotation.define<boolean>();

type CtnClosedMultilineBlock = CtnEditableBlock & {
  marker: string;
  multilineRange: CtnClosedMultilineRange;
};

function isClosedMultilineBlock(
  block: CtnEditableBlock,
): block is CtnClosedMultilineBlock {
  return block.role === "multiline" &&
    block.marker !== null &&
    block.multilineRange?.status === "closed";
}

export function findMultilineBlockAtLine(
  document: CtnEditableDocument,
  lineNumber: number,
) {
  let low = 0;
  let high = document.blocks.length - 1;
  let candidate: CtnEditableBlock | null = null;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const block = document.blocks[middle];

    if (block.lineNumber <= lineNumber) {
      candidate = block;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return candidate?.role === "multiline" &&
    lineNumber <= candidate.lexicalEndLineNumber
    ? candidate
    : null;
}

function isMultilineContentLine(
  block: CtnEditableBlock,
  lineNumber: number,
) {
  return Boolean(
    block.multilineRange &&
    lineNumber >= block.multilineRange.contentStartLineNumber &&
    lineNumber <= block.multilineRange.contentEndLineNumber,
  );
}

function getLeadingWhitespace(text: string) {
  return text.match(/^\s*/)?.[0] ?? "";
}

function getOutdentLength(text: string, tabSize: number) {
  if (text.startsWith("\t")) {
    return 1;
  }

  const spaces = text.match(/^ +/)?.[0].length ?? 0;

  return Math.min(spaces, tabSize);
}

function createCodeCardProtectionState(
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
    const closingLineNumber = block.multilineRange.closingFenceLineNumber;
    const closer = state.doc.line(closingLineNumber);

    ranges.push({
      from: opener.from,
      kind: "fence",
      to: opener.to,
    });
    ranges.push({
      from: closer.from,
      kind: "fence",
      to: closer.to,
    });

    if (opener.number < closer.number) {
      const firstFollowingLine = state.doc.line(opener.number + 1);

      ranges.push({
        from: opener.to,
        kind: "separator",
        to: firstFollowingLine.from,
      });
      const previousLine = state.doc.line(closer.number - 1);

      ranges.push({
        from: previousLine.to,
        kind: "separator",
        to: closer.from,
      });
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

function insertionTouchesProtectedRange(
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
    return ranges.some((range) => insertionTouchesProtectedRange(from, range));
  }

  return ranges.some((range) => from < range.to && to > range.from);
}

function createCodeCardProtectionField(
  syntaxProfileRef: { current: CtnSyntaxProfile },
  contentMode: CtnEditorParsedContentMode,
) {
  return StateField.define<CtnCodeCardProtectionState>({
    create(state) {
      return createCodeCardProtectionState(
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
        ? createCodeCardProtectionState(
            transaction.state,
            syntaxProfileRef.current,
            contentMode,
          )
        : value;
    },
  });
}

function createCodeCardUiField(
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
      if (!next || explicit || (!transaction.docChanged && !transaction.selection)) {
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

function createButton(
  label: string,
  ariaLabel: string,
  onSelect: () => void,
  className = "",
) {
  const button = document.createElement("button");

  button.type = "button";
  button.textContent = label;
  button.title = label;
  button.setAttribute("aria-label", ariaLabel);
  if (className) {
    button.className = className;
  }
  button.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onSelect();
  });
  return button;
}

class CtnCodeCardHeaderWidget extends WidgetType {
  constructor(
    readonly block: CtnEditableBlock,
    readonly mode: CtnCodeCardMode | null,
  ) {
    super();
  }

  eq(other: CtnCodeCardHeaderWidget) {
    return this.block.label === other.block.label &&
      this.block.lineNumber === other.block.lineNumber &&
      this.block.marker === other.block.marker &&
      this.block.text === other.block.text &&
      this.mode === other.mode;
  }

  toDOM(view: EditorView) {
    const header = document.createElement("span");
    const label = document.createElement("span");
    const identifier = document.createElement("span");
    const actions = document.createElement("span");
    const select = () => {
      const line = view.state.doc.line(this.block.lineNumber);

      view.dispatch({
        effects: setCtnCodeCardUiState.of({
          lineNumber: this.block.lineNumber,
          mode: "selected",
        }),
        selection: { anchor: line.to },
        scrollIntoView: true,
      });
      view.focus();
    };

    header.className = this.mode
      ? "ctn-code-card-header is-selected"
      : "ctn-code-card-header";
    header.dataset.codeBlockLine = String(this.block.lineNumber);
    header.setAttribute("aria-label", `${this.block.label}代码块`);
    header.setAttribute("role", "group");
    label.className = "ctn-code-card-label";
    label.textContent = this.block.label;
    identifier.className = "ctn-code-card-identifier";
    identifier.textContent = this.block.text || "无标识";
    actions.className = "ctn-code-card-actions";
    header.append(label);

    if (this.mode === "editing") {
      const input = document.createElement("input");
      const confirm = () => {
        if (!this.block.marker) {
          return;
        }
        const line = view.state.doc.line(this.block.lineNumber);
        const suffix = input.value.trim();
        const replacement =
          `${this.block.indentText}${this.block.marker}${suffix}`;

        view.dispatch({
          annotations: ctnCodeCardDocumentChange.of(true),
          changes: {
            from: line.from,
            insert: replacement,
            to: line.to,
          },
          effects: setCtnCodeCardUiState.of({
            lineNumber: this.block.lineNumber,
            mode: "selected",
          }),
          selection: { anchor: line.from + replacement.length },
        });
        view.focus();
      };
      const cancel = () => {
        view.dispatch({
          effects: setCtnCodeCardUiState.of({
            lineNumber: this.block.lineNumber,
            mode: "selected",
          }),
        });
        view.focus();
      };

      input.className = "ctn-code-card-identifier-input";
      input.value = this.block.text;
      input.setAttribute("aria-label", "代码块标识");
      input.addEventListener("mousedown", (event) => event.stopPropagation());
      input.addEventListener("click", (event) => event.stopPropagation());
      input.addEventListener("keydown", (event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          confirm();
        } else if (event.key === "Escape") {
          event.preventDefault();
          cancel();
        }
      });
      header.append(input);
      actions.append(
        createButton("确定", "确定修改代码块标识", confirm),
        createButton("取消", "取消修改代码块标识", cancel),
      );
      queueMicrotask(() => {
        input.focus();
        input.select();
      });
    } else {
      header.append(identifier);
      if (this.mode === "delete-confirm") {
        actions.append(
          createButton(
            "确认",
            "确认删除代码块",
            () => {
              const opener = view.state.doc.line(this.block.lineNumber);
              const closingLineNumber =
                this.block.multilineRange?.closingFenceLineNumber;

              if (closingLineNumber === null ||
                  closingLineNumber === undefined) {
                return;
              }
              const closer = view.state.doc.line(closingLineNumber);
              let from = opener.from;
              let to = closer.to;

              if (closer.number < view.state.doc.lines) {
                to = view.state.doc.line(closer.number + 1).from;
              } else if (opener.number > 1) {
                from = view.state.doc.line(opener.number - 1).to;
              }
              view.dispatch({
                annotations: ctnCodeCardDocumentChange.of(true),
                changes: { from, insert: "", to },
                effects: setCtnCodeCardUiState.of(null),
                selection: { anchor: from },
              });
              view.focus();
            },
            "ctn-code-card-danger",
          ),
          createButton(
            "取消",
            "取消删除代码块",
            () => {
              view.dispatch({
                effects: setCtnCodeCardUiState.of({
                  lineNumber: this.block.lineNumber,
                  mode: "selected",
                }),
              });
              view.focus();
            },
          ),
        );
      } else if (this.mode === "selected") {
        actions.append(
          createButton("改", "修改代码块标识", () => {
            view.dispatch({
              effects: setCtnCodeCardUiState.of({
                lineNumber: this.block.lineNumber,
                mode: "editing",
              }),
            });
          }),
          createButton(
            "删",
            "删除代码块",
            () => {
              view.dispatch({
                effects: setCtnCodeCardUiState.of({
                  lineNumber: this.block.lineNumber,
                  mode: "delete-confirm",
                }),
              });
            },
            "ctn-code-card-danger",
          ),
        );
      }
    }
    header.append(actions);
    header.addEventListener("mousedown", (event) => {
      if (event.target === header || event.target === label ||
          event.target === identifier) {
        event.preventDefault();
        event.stopPropagation();
        select();
      }
    });
    return header;
  }

  ignoreEvent() {
    return false;
  }
}

class CtnCodeCardEndWidget extends WidgetType {
  eq() {
    return true;
  }

  toDOM() {
    const end = document.createElement("span");

    end.className = "ctn-code-card-end";
    end.setAttribute("aria-hidden", "true");
    return end;
  }
}

function createCodeCardDecorations(
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
    const selected = ui?.lineNumber === block.lineNumber ? ui.mode : null;
    const opener = view.state.doc.line(block.lineNumber);
    const closingLineNumber = block.multilineRange.closingFenceLineNumber;
    const closer = view.state.doc.line(closingLineNumber);
    const header = Decoration.replace({
      widget: new CtnCodeCardHeaderWidget(block, selected),
    }).range(opener.from, opener.to);
    const end = Decoration.replace({
      widget: new CtnCodeCardEndWidget(),
    }).range(closer.from, closer.to);

    decorations.push(
      Decoration.line({
        attributes: {
          class: selected
            ? "ctn-code-card-line ctn-code-card-start is-selected"
            : "ctn-code-card-line ctn-code-card-start",
        },
      }).range(opener.from),
      header,
      Decoration.line({
        attributes: {
          class: selected
            ? "ctn-code-card-line ctn-code-card-finish is-selected"
            : "ctn-code-card-line ctn-code-card-finish",
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
            class: selected
              ? "ctn-code-card-line ctn-code-card-body is-selected"
              : "ctn-code-card-line ctn-code-card-body",
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

export function createCtnCodeBlockEnterTransaction(
  state: EditorState,
  document: CtnEditableDocument,
): TransactionSpec | null {
  if (
    state.selection.ranges.length !== 1 ||
    !state.selection.main.empty
  ) {
    return null;
  }

  const cursor = state.selection.main.head;
  const line = state.doc.lineAt(cursor);
  const block = findMultilineBlockAtLine(document, line.number);

  if (
    !block ||
    block.multilineRange?.closingFenceLineNumber === line.number
  ) {
    return null;
  }

  if (
    line.number === block.lineNumber &&
    block.marker &&
    block.multilineRange?.status === "unterminated" &&
    cursor === line.to
  ) {
    const bodyIndent = `${block.indentText}\t`;
    const bodyPrefix = `\n${bodyIndent}`;
    const insert = `${bodyPrefix}\n${block.indentText}${block.marker}`;

    return {
      annotations: ctnCodeCardDocumentChange.of(true),
      changes: { from: cursor, insert, to: cursor },
      selection: { anchor: cursor + bodyPrefix.length },
    };
  }

  if (line.number === block.lineNumber) {
    return null;
  }

  const indentText =
    getLeadingWhitespace(line.text) || `${block.indentText}\t`;
  const insert = `\n${indentText}`;

  return {
    changes: { from: cursor, insert, to: cursor },
    selection: { anchor: cursor + insert.length },
  };
}

export function createCtnCodeBlockIndentChanges(
  state: EditorState,
  document: CtnEditableDocument,
  direction: CtnMultilineIndentDirection,
): ChangeSpec[] | null {
  if (state.selection.ranges.length !== 1) {
    return null;
  }

  const selection = state.selection.main;
  const activeLine = state.doc.lineAt(selection.head);
  const block = findMultilineBlockAtLine(document, activeLine.number);

  if (!block || !isMultilineContentLine(block, activeLine.number)) {
    return null;
  }
  if (!selection.empty) {
    return [];
  }
  if (direction === "indent") {
    return [{ from: selection.head, insert: "\t", to: selection.head }];
  }
  const basePrefix = getCtnMultilineBodyBasePrefix(block, activeLine.text);
  const visibleText = activeLine.text.slice(basePrefix.length);
  const removeLength = getOutdentLength(visibleText, state.tabSize);
  const from = activeLine.from + basePrefix.length;

  return removeLength > 0
    ? [{ from, insert: "", to: from + removeLength }]
    : [];
}

export function createCtnCodeBlockStructuralIndentChanges(
  state: EditorState,
  document: CtnEditableDocument,
  direction: CtnMultilineIndentDirection,
): ChangeSpec[] | null {
  if (state.selection.ranges.length !== 1) {
    return null;
  }
  const activeLine = state.doc.lineAt(state.selection.main.head);
  const block = findMultilineBlockAtLine(document, activeLine.number);

  if (!block || block.lineNumber !== activeLine.number) {
    return null;
  }
  const lines = state.doc.toString().split("\n");

  return createCtnMultilineStructuralIndentEdits(
    block,
    lines,
    direction,
  ).map((edit) => {
    const line = state.doc.line(edit.lineNumber);

    return {
      from: line.from,
      insert: edit.nextPrefix,
      to: line.from + edit.previousPrefix.length,
    };
  });
}

export function createCtnCodeBlockEditingExtensions(
  parsePlugin: CtnEditorParsePlugin,
  syntaxProfileRef: { current: CtnSyntaxProfile },
  contentMode: CtnEditorParsedContentMode,
) {
  const protectionField = createCodeCardProtectionField(
    syntaxProfileRef,
    contentMode,
  );
  const uiField = createCodeCardUiField(syntaxProfileRef, contentMode);
  const codeCards = ViewPlugin.fromClass(
    class {
      atomicRanges: DecorationSet;
      decorations: DecorationSet;

      constructor(view: EditorView) {
        const built = createCodeCardDecorations(view, parsePlugin, uiField);

        this.atomicRanges = built.atomicRanges;
        this.decorations = built.decorations;
      }

      update(update: { view: EditorView }) {
        const built = createCodeCardDecorations(
          update.view,
          parsePlugin,
          uiField,
        );

        this.atomicRanges = built.atomicRanges;
        this.decorations = built.decorations;
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );
  const runEnter = (view: EditorView) => {
    const parsed = view.plugin(parsePlugin);
    const transaction = parsed
      ? createCtnCodeBlockEnterTransaction(view.state, parsed.document)
      : null;

    if (!transaction) {
      return false;
    }

    view.dispatch(transaction);
    return true;
  };
  const runIndent = (
    view: EditorView,
    direction: CtnMultilineIndentDirection,
  ) => {
    const parsed = view.plugin(parsePlugin);

    if (!parsed) {
      return false;
    }
    const ui = view.state.field(uiField);
    const activeLine = view.state.doc.lineAt(
      view.state.selection.main.head,
    ).number;
    const structuralChanges =
      ui?.lineNumber === activeLine
        ? createCtnCodeBlockStructuralIndentChanges(
            view.state,
            parsed.document,
            direction,
          )
        : null;
    const changes = structuralChanges ??
      createCtnCodeBlockIndentChanges(
        view.state,
        parsed.document,
        direction,
      );

    if (changes === null) {
      return false;
    }
    if (changes.length > 0) {
      view.dispatch({
        annotations: ctnCodeCardDocumentChange.of(true),
        changes,
      });
    }
    return true;
  };

  return [
    protectionField,
    uiField,
    EditorState.transactionFilter.of((transaction) => {
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
    }),
    codeCards,
    EditorView.atomicRanges.of(
      (view) => view.plugin(codeCards)?.atomicRanges ?? Decoration.none,
    ),
    Prec.high(
      keymap.of([
        { key: "Enter", run: runEnter },
        { key: "Tab", run: (view) => runIndent(view, "indent") },
        {
          key: "Shift-Tab",
          run: (view) => runIndent(view, "outdent"),
        },
      ]),
    ),
  ];
}
