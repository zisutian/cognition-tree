import { describe, expect, it, vi } from "vitest";
import { createCtnSyntaxDraft } from "../../../core/ctn/syntax/draft";
import { defaultCtnSyntax } from "../../../core/ctn/syntax/defaultSyntax";
import { defaultJournalSyntax } from "../../../core/journal/syntax/defaultJournalSyntax";
import { createSyntaxDraftActions } from "../../../application/syntax/syntaxDraftActions";
import { defaultTodoSyntax } from "../../../core/todo/syntax/defaultTodoSyntax";

describe("syntax draft actions", () => {
  it("keeps ordinary custom semantic ids editable", () => {
    const draft = createCtnSyntaxDraft(defaultCtnSyntax);
    const update = vi.fn();
    const actions = createSyntaxDraftActions({
      owner: "workspace",
      syntaxDraft: draft,
      updateSyntaxDraft: update,
    });
    const rule = draft.blocks[0];

    actions.actions.updateBlock(rule.id, {
      semanticId: "renamed-definition",
    });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      blocks: expect.arrayContaining([
        expect.objectContaining({
          id: rule.id,
          semanticId: "renamed-definition",
        }),
      ]),
    }));
  });

  it("locks the Todo item identity and structure while keeping its colors editable", () => {
    const draft = createCtnSyntaxDraft(defaultTodoSyntax);
    const rule = draft.blocks.find(
      ({ semanticId }) => semanticId === "todo-item"
    )!;
    const update = vi.fn();
    const actions = createSyntaxDraftActions({
      owner: "todo",
      syntaxDraft: draft,
      updateSyntaxDraft: update,
    });

    actions.actions.updateBlock(rule.id, {
      kind: "multiline",
      label: "任务",
      marker: "[ ]",
      semanticId: "custom-item",
      textColor: "red",
      tone: "violet",
    });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      blocks: expect.arrayContaining([
        expect.objectContaining({
          label: "代办",
          marker: "[]",
          kind: "line",
          semanticId: "todo-item",
          textColor: "red",
          tone: "violet",
        }),
        expect.objectContaining({
          label: "注解",
          marker: ">",
          semanticId: "marker-rule-2",
        }),
      ]),
    }));
    actions.actions.removeBlock(rule.id);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("locks the Journal name and reference trigger while keeping presentation editable", () => {
    const draft = createCtnSyntaxDraft(defaultJournalSyntax);
    const rule = draft.inline.find(
      ({ semanticId }) => semanticId === "global-reference",
    )!;
    const update = vi.fn();
    const actions = createSyntaxDraftActions({
      owner: "journal",
      syntaxDraft: draft,
      updateSyntaxDraft: update,
    });

    actions.actions.updateName("可变名称");
    expect(update).not.toHaveBeenCalled();

    actions.actions.updateInline(rule.id, {
      close: ">>",
      label: "笔记引用",
      open: "<<",
      tone: "pink",
      semanticId: "custom-reference",
    });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      inline: expect.arrayContaining([
        expect.objectContaining({
          close: "]]",
          label: "笔记引用",
          open: "[[",
          tone: "pink",
          semanticId: "global-reference",
        }),
      ]),
    }));
  });
});
