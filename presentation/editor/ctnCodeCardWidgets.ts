// SPDX-License-Identifier: GPL-3.0-or-later

import {
  EditorView,
  WidgetType,
} from "@codemirror/view";
import type { CtnClosedMultilineBlock } from "./ctnCodeBlockCommands";
import {
  ctnCodeCardDocumentChange,
  setCtnCodeCardUiState,
  type CtnCodeCardMode,
} from "./ctnCodeCardState";

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

export class CtnCodeCardHeaderWidget extends WidgetType {
  constructor(
    readonly block: CtnClosedMultilineBlock,
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
      this.#renderIdentifierEditor(view, header, actions);
    } else {
      header.append(identifier);
      this.#renderActions(view, actions);
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

  #renderIdentifierEditor(
    view: EditorView,
    header: HTMLElement,
    actions: HTMLElement,
  ) {
    const input = document.createElement("input");
    const selectCard = () => setCtnCodeCardUiState.of({
      lineNumber: this.block.lineNumber,
      mode: "selected",
    });
    const confirm = () => {
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
        effects: selectCard(),
        selection: { anchor: line.from + replacement.length },
      });
      view.focus();
    };
    const cancel = () => {
      view.dispatch({ effects: selectCard() });
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
  }

  #renderActions(view: EditorView, actions: HTMLElement) {
    const selectMode = (mode: CtnCodeCardMode) => {
      view.dispatch({
        effects: setCtnCodeCardUiState.of({
          lineNumber: this.block.lineNumber,
          mode,
        }),
      });
    };

    if (this.mode === "delete-confirm") {
      actions.append(
        createButton(
          "确认",
          "确认删除代码块",
          () => this.#deleteBlock(view),
          "ctn-code-card-danger",
        ),
        createButton(
          "取消",
          "取消删除代码块",
          () => {
            selectMode("selected");
            view.focus();
          },
        ),
      );
    } else if (this.mode === "selected") {
      actions.append(
        createButton("改", "修改代码块标识", () => selectMode("editing")),
        createButton(
          "删",
          "删除代码块",
          () => selectMode("delete-confirm"),
          "ctn-code-card-danger",
        ),
      );
    }
  }

  #deleteBlock(view: EditorView) {
    const opener = view.state.doc.line(this.block.lineNumber);
    const closer = view.state.doc.line(
      this.block.multilineRange.closingFenceLineNumber,
    );
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
  }

  ignoreEvent() {
    return false;
  }
}

export class CtnCodeCardEndWidget extends WidgetType {
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
