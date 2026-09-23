// SPDX-License-Identifier: GPL-3.0-or-later

import {
  createMyersTextEdits,
  type CtnEditableSourceChange,
} from "../../../../core/ctn/index.ts";
import type { NotesViewModel } from "../../../../application/workspace/index.ts";

function titleRange(source: string, lineNumber: number) {
  let from = 0;

  for (let line = 1; line < lineNumber; line += 1) {
    const end = source.indexOf("\n", from);

    if (end < 0) {
      return { from: source.length, missingLines: lineNumber - line, to: source.length };
    }
    from = end + 1;
  }
  const end = source.indexOf("\n", from);

  return { from, missingLines: 0, to: end < 0 ? source.length : end };
}

function titleAt(source: string, lineNumber: number) {
  const range = titleRange(source, lineNumber);

  return range.missingLines > 0 ? "" : source.slice(range.from, range.to);
}

function withTitle(source: string, lineNumber: number, title: string) {
  const range = titleRange(source, lineNumber);

  return range.missingLines > 0
    ? `${source}${"\n".repeat(range.missingLines)}${title}`
    : `${source.slice(0, range.from)}${title}${source.slice(range.to)}`;
}

export function createNotesTitleEditSession({
  initialSource,
  notify,
  onDraftChange,
  submit,
  synchronize,
  titleLineNumber,
}: {
  initialSource: string;
  notify: (message: string) => void;
  onDraftChange: (source: string | null) => void;
  submit: (
    change: CtnEditableSourceChange,
    authoritativeSource: string,
    keepEditorDraft: boolean,
  ) => ReturnType<NotesViewModel["updateSource"]> | undefined;
  synchronize: (source: string) => void;
  titleLineNumber: number;
}) {
  let authoritativeSource = initialSource;
  let observedSource = initialSource;
  let draftSource: string | null = null;
  let activeLineNumber = titleLineNumber;
  let handledEditorSource: string | null = null;
  let commitAfterComposition = false;

  const submitSource = (source: string, keepEditorDraft: boolean) => {
    if (source === authoritativeSource) return true;
    const result = submit({
      edits: createMyersTextEdits(authoritativeSource, source),
      source,
    }, authoritativeSource, keepEditorDraft);

    if (!result) return false;
    authoritativeSource = result.authoritativeSource;
    return true;
  };

  const saveBody = (source: string) => {
    const bodySource = withTitle(
      source,
      titleLineNumber,
      titleAt(authoritativeSource, titleLineNumber),
    );

    return submitSource(bodySource, true);
  };

  const clearDraft = () => {
    draftSource = null;
    onDraftChange(null);
  };

  const commit = (source: string) => {
    commitAfterComposition = false;
    const draftTitle = titleAt(source, titleLineNumber);
    const committedTitle = titleAt(authoritativeSource, titleLineNumber);

    if (draftSource === null && draftTitle === committedTitle) {
      return;
    }
    if (draftSource === null && source === handledEditorSource) return;
    handledEditorSource = source;
    if (!saveBody(source)) {
      clearDraft();
      synchronize(authoritativeSource);
      return;
    }

    clearDraft();
    if (!draftTitle.trim()) {
      notify("笔记标题不能为空，已恢复原标题。");
      synchronize(authoritativeSource);
      return;
    }

    const nextSource = withTitle(authoritativeSource, titleLineNumber, draftTitle);

    if (!submitSource(nextSource, false)) {
      synchronize(authoritativeSource);
      return;
    }
    synchronize(authoritativeSource);
  };

  return {
    observeAuthoritativeSource(source: string) {
      if (source !== observedSource) {
        observedSource = source;
        authoritativeSource = source;
      }
    },
    onChange(change: CtnEditableSourceChange) {
      if (change.source === handledEditorSource) return;
      handledEditorSource = null;
      const titleChanged = titleAt(change.source, titleLineNumber) !==
        titleAt(authoritativeSource, titleLineNumber);

      if (draftSource === null && !titleChanged) {
        commitAfterComposition = false;
        if (change.source !== authoritativeSource) {
          const result = submit(change, authoritativeSource, false);

          if (result) authoritativeSource = result.authoritativeSource;
        }
        return;
      }

      draftSource = change.source;
      onDraftChange(change.source);
      if (!saveBody(change.source)) {
        clearDraft();
        synchronize(authoritativeSource);
        return;
      }
      if (activeLineNumber !== titleLineNumber || commitAfterComposition) {
        commit(change.source);
      }
    },
    onActiveLineChange(lineNumber: number, source: string, isComposing = false) {
      const leftTitle = activeLineNumber === titleLineNumber &&
        lineNumber !== titleLineNumber;

      activeLineNumber = lineNumber;
      if (isComposing) {
        if (leftTitle) commitAfterComposition = true;
        return;
      }
      if (leftTitle || (draftSource !== null && lineNumber !== titleLineNumber)) {
        commit(source);
      }
    },
    onBlur(source: string, isComposing = false) {
      if (isComposing) {
        commitAfterComposition = true;
        return;
      }
      commit(source);
    },
  };
}
