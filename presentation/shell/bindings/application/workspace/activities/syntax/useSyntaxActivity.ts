import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { defaultCtnSyntaxProfile } from "../../../../../../../core/ctn/syntax/defaultSyntaxProfile";
import { createSyntaxProfileDraft } from "../../../../../../../core/ctn/syntax/profileDraft";
import { syntaxProfileSchema } from "../../../../../../../core/ctn/syntax/profileSchema";
import {
  createUiSystemSyntaxDiagnostics,
  createUiSyntaxDiagnostics,
} from "../../../../../../../application/workspace/projection/viewDiagnostics";
import { createUiSyntaxView } from "../../../../../../../application/workspace/projection/viewSyntax";
import type { SyntaxRuntime } from "../../runtime/useSyntaxRuntime";
import { createSyntaxDraftActions } from "../../../../../../../application/workspace/activities/syntax/syntaxDraftActions";
import {
  createSyntaxFileViews,
  isSameSyntaxTarget,
  type SyntaxTarget,
  type SyntaxViewModel,
} from "../../../../../../../application/workspace/activities/syntax/syntaxViewModel";
import {
  useSystemSyntaxRuntime,
  type SystemSyntaxSource,
} from "./useSystemSyntaxRuntime";

export function projectSyntaxFocusTargetForSelectedFile(
  focusTarget: SyntaxViewModel["focusTarget"],
  selectedFileId: string | null,
) {
  return focusTarget && "syntaxFileId" in focusTarget &&
      focusTarget.syntaxFileId === selectedFileId
    ? focusTarget
    : null;
}

export function getSyntaxFocusFileIdToSelect(
  focusTarget: SyntaxViewModel["focusTarget"],
  selectedFileId: string | null,
) {
  return focusTarget && "syntaxFileId" in focusTarget &&
      focusTarget.syntaxFileId !== selectedFileId
    ? focusTarget.syntaxFileId
    : null;
}

function initialTarget(
  workspace: SyntaxRuntime | null,
  journalAvailable: boolean,
  todoAvailable: boolean,
): SyntaxTarget {
  return workspace?.selectedFileId
    ? { fileId: workspace.selectedFileId, kind: "workspace-file" }
    : journalAvailable || !todoAvailable
      ? { kind: "journal" }
      : { kind: "todo" };
}

export function useSyntaxActivity({
  focusTarget,
  journalSyntax,
  onConsumeFocusTarget,
  todoSyntax,
  workspace,
}: {
  focusTarget: SyntaxViewModel["focusTarget"];
  journalSyntax: SystemSyntaxSource | null;
  onConsumeFocusTarget: SyntaxViewModel["onConsumeFocusTarget"];
  todoSyntax: SystemSyntaxSource | null;
  workspace: SyntaxRuntime | null;
}): SyntaxViewModel {
  const journal = useSystemSyntaxRuntime({
    owner: "journal",
    syntax: journalSyntax,
  });
  const todo = useSystemSyntaxRuntime({ owner: "todo", syntax: todoSyntax });
  const [selectedTarget, setSelectedTarget] = useState<SyntaxTarget>(() =>
    initialTarget(workspace, journal.available, todo.available)
  );
  const hasExplicitSelectionRef = useRef(false);
  const selectedSystem = selectedTarget.kind === "journal"
    ? journal
    : selectedTarget.kind === "todo"
      ? todo
      : null;
  const selectedWorkspace = selectedTarget.kind === "workspace-file"
    ? workspace
    : null;
  const draft = selectedSystem?.draft ?? selectedWorkspace?.syntaxDraft ??
    journal.draft ?? todo.draft ?? workspace?.syntaxDraft ??
    createSyntaxProfileDraft(defaultCtnSyntaxProfile);

  const hasDraftErrors = selectedSystem?.hasDraftErrors ??
    selectedWorkspace?.hasDraftErrors ?? false;
  const isSelectedAvailable = selectedSystem?.available ??
    Boolean(selectedWorkspace && selectedTarget.kind === "workspace-file" &&
      selectedWorkspace.files.some(({ id }) => id === selectedTarget.fileId));
  const policy = selectedSystem?.policy ?? { scope: "workspace" as const };
  const updateDraft = selectedSystem?.updateDraft ??
    selectedWorkspace?.updateSyntaxDraft ?? (() => undefined);
  const protectedMarkerRuleIds = selectedTarget.kind === "todo"
    ? draft.markerRules
      .filter(({ type }) => type === syntaxProfileSchema.requiredTypes.todoItem)
      .map(({ id }) => id)
    : [];
  const protectedInlineTriggerRuleIds = selectedTarget.kind === "journal"
    ? draft.inlineRules
      .filter(({ type }) =>
        type === syntaxProfileSchema.requiredTypes.globalReference
      )
      .map(({ id }) => id)
    : [];
  const draftActions = useMemo(
    () => createSyntaxDraftActions({
      nameEditable: selectedTarget.kind === "workspace-file",
      protectedInlineTriggerRuleIds,
      protectedMarkerRuleIds,
      syntaxDraft: draft,
      updateSyntaxDraft: updateDraft,
    }),
    [
      draft,
      protectedInlineTriggerRuleIds.join("\0"),
      protectedMarkerRuleIds.join("\0"),
      selectedTarget.kind,
      updateDraft,
    ],
  );
  const focusTargetForSelectedFile = selectedTarget.kind === "workspace-file"
    ? projectSyntaxFocusTargetForSelectedFile(
        focusTarget,
        selectedTarget.fileId,
      )
    : focusTarget && "systemOwner" in focusTarget &&
        focusTarget.systemOwner === selectedTarget.kind
      ? focusTarget
      : null;
  const view = useMemo(
    () => createUiSyntaxView({
      draft,
      focusTarget: focusTargetForSelectedFile,
      policy,
    }),
    [draft, focusTargetForSelectedFile, policy],
  );

  const assertCanLeave = useCallback(() => {
    if (hasDraftErrors) {
      throw new Error("请先修复或撤销当前语法文件中的无效更改。");
    }
  }, [hasDraftErrors]);
  const selectTarget = useCallback(async (target: SyntaxTarget) => {
    hasExplicitSelectionRef.current = true;
    if (isSameSyntaxTarget(target, selectedTarget)) {
      return;
    }
    assertCanLeave();
    if (target.kind === "workspace-file") {
      if (!workspace) {
        throw new Error("当前没有可用的笔记库语法。");
      }
      await workspace.selectSyntaxFile(target.fileId);
    } else {
      const runtime = target.kind === "journal" ? journal : todo;

      if (!runtime.available) {
        throw new Error(`${target.kind === "journal" ? "日记" : "代办"}语法暂不可用。`);
      }
    }
    setSelectedTarget(target);
  }, [assertCanLeave, journal, selectedTarget, todo, workspace]);
  const createFile = useCallback(async () => {
    assertCanLeave();
    if (!workspace) {
      throw new Error("当前没有可用的笔记库。");
    }
    const fileId = await workspace.createSyntaxFile();

    hasExplicitSelectionRef.current = true;
    setSelectedTarget({ fileId, kind: "workspace-file" });
    return fileId;
  }, [assertCanLeave, workspace]);
  const deleteFile = useCallback(async (fileId: string) => {
    assertCanLeave();
    if (!workspace) {
      throw new Error("当前没有可用的笔记库。");
    }
    const fileIndex = workspace.files.findIndex(({ id }) => id === fileId);
    const nextFileId = workspace.files[fileIndex + 1]?.id ??
      workspace.files[fileIndex - 1]?.id ?? null;

    await workspace.deleteSyntaxFile(fileId);
    setSelectedTarget(nextFileId
      ? { fileId: nextFileId, kind: "workspace-file" }
      : { kind: "journal" });
  }, [assertCanLeave, workspace]);
  const activateFile = useCallback(async (fileId: string) => {
    assertCanLeave();
    if (!workspace) {
      throw new Error("当前没有可用的笔记库。");
    }
    await workspace.enableSyntaxFile(fileId);
  }, [assertCanLeave, workspace]);
  const revertInvalidChanges = useCallback(() => {
    if (selectedTarget.kind === "journal") {
      journal.revertDraft();
    } else if (selectedTarget.kind === "todo") {
      todo.revertDraft();
    } else {
      workspace?.revertSyntaxDraft();
    }
  }, [journal, selectedTarget.kind, todo, workspace]);

  useEffect(() => {
    if (
      !hasExplicitSelectionRef.current &&
      selectedTarget.kind !== "workspace-file" &&
      workspace?.selectedFileId
    ) {
      setSelectedTarget({
        fileId: workspace.selectedFileId,
        kind: "workspace-file",
      });
      return;
    }
    if (selectedTarget.kind !== "workspace-file" || !workspace) {
      return;
    }
    const selectedExists = workspace.files.some(
      ({ id }) => id === selectedTarget.fileId,
    );

    if (!selectedExists) {
      setSelectedTarget(workspace.selectedFileId
        ? { fileId: workspace.selectedFileId, kind: "workspace-file" }
        : { kind: "journal" });
    }
  }, [selectedTarget, workspace]);

  useEffect(() => {
    if (focusTarget && "systemOwner" in focusTarget) {
      void selectTarget({ kind: focusTarget.systemOwner }).catch(
        () => undefined,
      );
      return;
    }
    const fileId = getSyntaxFocusFileIdToSelect(
      focusTarget,
      selectedTarget.kind === "workspace-file"
        ? selectedTarget.fileId
        : null,
    );

    if (!fileId || !workspace) {
      return;
    }
    void selectTarget({ fileId, kind: "workspace-file" }).catch(
      () => undefined,
    );
  }, [focusTarget, selectTarget, selectedTarget, workspace]);

  const files = createSyntaxFileViews({
    activeFileId: workspace?.activeFileId ?? null,
    files: workspace?.files ?? [],
    hasDraftErrors,
    selectedFileId: workspace?.selectedFileId ?? null,
    selectedTarget,
  });
  const systemConfigurations = [
    {
      available: journal.available,
      hasErrors: selectedTarget.kind === "journal" && journal.hasDraftErrors,
      isSelected: selectedTarget.kind === "journal",
      label: "日记",
      owner: "journal" as const,
    },
    {
      available: todo.available,
      hasErrors: selectedTarget.kind === "todo" && todo.hasDraftErrors,
      isSelected: selectedTarget.kind === "todo",
      label: "代办",
      owner: "todo" as const,
    },
  ];
  const selectedDraftResult = selectedSystem?.draftResult ??
    selectedWorkspace?.syntaxDraftResult ?? null;
  const profileDiagnostics = useMemo(() => selectedDraftResult
    ? selectedTarget.kind === "workspace-file"
      ? createUiSyntaxDiagnostics(
          draft,
          selectedDraftResult,
          selectedTarget.fileId,
          workspace?.catalogNameConflictMessage ?? "",
        )
      : createUiSystemSyntaxDiagnostics(
          draft,
          selectedDraftResult,
          selectedTarget.kind,
        )
    : [], [
      draft,
      selectedDraftResult,
      selectedTarget,
      workspace?.catalogNameConflictMessage,
    ]);

  return {
    ...view,
    ...draftActions,
    activeFileId: workspace?.activeFileId ?? null,
    activateFile,
    createFile,
    deleteFile,
    files,
    hasDraftErrors,
    isConfigured: isSelectedAvailable,
    isSelectedAvailable,
    nameConflictMessage: selectedTarget.kind === "workspace-file"
      ? workspace?.catalogNameConflictMessage ?? ""
      : "",
    onConsumeFocusTarget,
    policy,
    profileDiagnostics,
    revertInvalidChanges,
    rootRuleLabel: selectedTarget.kind === "workspace-file"
      ? "顶格概念"
      : selectedTarget.kind === "journal"
        ? "顶格正文"
        : null,
    selectedTarget,
    selectTarget,
    systemConfigurations,
    workspaceAvailable: workspace !== null,
  };
}
