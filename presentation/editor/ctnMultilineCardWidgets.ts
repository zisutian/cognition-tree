// SPDX-License-Identifier: GPL-3.0-or-later

import {
  EditorView,
  WidgetType,
} from "@codemirror/view";
import type {
  CtnClosedMultilineBlock,
} from "../../core/ctn/editing/multilineBlockLayout";

export class CtnMultilineCardHeaderWidget extends WidgetType {
  constructor(
    readonly block: CtnClosedMultilineBlock,
    readonly selected: boolean,
  ) {
    super();
  }

  eq(other: CtnMultilineCardHeaderWidget) {
    return this.block.label === other.block.label &&
      this.block.lineNumber === other.block.lineNumber &&
      this.block.marker === other.block.marker &&
      this.block.text === other.block.text &&
      this.selected === other.selected;
  }

  toDOM(view: EditorView) {
    const header = document.createElement("span");
    const label = document.createElement("span");
    const select = () => {
      const line = view.state.doc.line(this.block.lineNumber);

      view.dispatch({
        selection: { anchor: line.to },
        scrollIntoView: true,
      });
      view.focus();
    };

    header.className = this.selected
      ? "ctn-multiline-card-header is-selected"
      : "ctn-multiline-card-header";
    header.dataset.multilineBlockLine = String(this.block.lineNumber);
    header.setAttribute("aria-label", `多行块：${this.block.label}`);
    header.setAttribute("role", "group");
    label.className = "ctn-multiline-card-label";
    label.textContent = this.block.label;
    header.append(label);

    if (this.block.text) {
      const suffix = document.createElement("span");

      suffix.className = "ctn-multiline-card-suffix";
      suffix.textContent = this.block.text;
      header.append(suffix);
    }
    header.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      select();
    });
    return header;
  }

  ignoreEvent() {
    return false;
  }
}

export class CtnMultilineCardEndWidget extends WidgetType {
  eq() {
    return true;
  }

  toDOM() {
    const end = document.createElement("span");

    end.className = "ctn-multiline-card-end";
    end.setAttribute("aria-hidden", "true");
    return end;
  }
}
