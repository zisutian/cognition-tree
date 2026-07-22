import { describe, expect, it, vi } from "vitest";
import { createSyntaxProfileDraft } from "../../../../../core/ctn/syntax/profileDraft";
import { defaultCtnSyntaxProfile } from "../../../../../core/ctn/syntax/defaultSyntaxProfile";
import { defaultJournalCtnSyntaxProfileV2 } from "../../../../../core/journal/syntax/journalSyntax";
import { createSyntaxDraftActions } from "../../../../../src/application/workspace/activities/syntax/syntaxDraftActions";
import { defaultTodoCtnSyntaxProfileV2 } from "../../../../../core/todo/syntax/todoSyntax";

describe("syntax draft actions", () => {
  it("keeps ordinary custom semantic ids editable", () => {
    const draft = createSyntaxProfileDraft(defaultCtnSyntaxProfile);
    const update = vi.fn();
    const actions = createSyntaxDraftActions({
      syntaxDraft: draft,
      updateSyntaxDraft: update,
    });
    const rule = draft.markerRules[0];

    actions.actions.updateMarkerRule(rule.id, { type: "renamed-definition" });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      markerRules: expect.arrayContaining([
        expect.objectContaining({ id: rule.id, type: "renamed-definition" }),
      ]),
    }));
  });

  it("locks only the Todo item semantic id and role", () => {
    const draft = createSyntaxProfileDraft(defaultTodoCtnSyntaxProfileV2);
    const rule = draft.markerRules.find(({ type }) => type === "todo-item")!;
    const update = vi.fn();
    const actions = createSyntaxDraftActions({
      protectedMarkerRuleIds: [rule.id],
      syntaxDraft: draft,
      updateSyntaxDraft: update,
    });

    actions.actions.updateMarkerRule(rule.id, {
      label: "任务",
      marker: "[ ]",
      role: "multiline",
      type: "custom-item",
    });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      markerRules: [expect.objectContaining({
        label: "任务",
        marker: "[ ]",
        role: "normal",
        type: "todo-item",
      })],
    }));
    actions.actions.removeMarkerRule(rule.id);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("locks the Journal name and reference trigger while keeping presentation editable", () => {
    const draft = createSyntaxProfileDraft(defaultJournalCtnSyntaxProfileV2);
    const rule = draft.inlineRules.find(
      ({ type }) => type === "global-reference",
    )!;
    const update = vi.fn();
    const actions = createSyntaxDraftActions({
      nameEditable: false,
      protectedInlineTriggerRuleIds: [rule.id],
      syntaxDraft: draft,
      updateSyntaxDraft: update,
    });

    actions.actions.updateName("可变名称");
    expect(update).not.toHaveBeenCalled();

    actions.actions.updateInlineRule(rule.id, {
      close: ">>",
      label: "笔记引用",
      open: "<<",
      tone: "pink",
      type: "custom-reference",
    });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      inlineRules: expect.arrayContaining([
        expect.objectContaining({
          close: "]]",
          label: "笔记引用",
          open: "[[",
          tone: "pink",
          type: "global-reference",
        }),
      ]),
    }));
  });
});
