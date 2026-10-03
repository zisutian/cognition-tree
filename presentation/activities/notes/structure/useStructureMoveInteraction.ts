import {
  type ContentTreeContextMenuRequest, type TreeDragScopeHandle,
  type TreeMoveRequest, type TreeMoveSession, type TreeMoveResult,
} from "compact-ui";
import { useRef, useState } from "react";
import type { WorkspaceBlockTarget } from "../../../../application/workspace/index.ts";
import { requireStructureMoveIntent, resolveStructureMoveIntent, type StructureMoveContext } from "./structureMoveIntent.ts";

/** Stores overlay visibility only; the framework owns and validates move sessions. */
export function useStructureMoveInteraction(context: StructureMoveContext,
  move: (sourceBlockIds: readonly string[], target: WorkspaceBlockTarget) => void,
  clearSelection: () => void,
) {
  const scopeRef = useRef<TreeDragScopeHandle>(null);
  const [menu, setMenu] = useState<ContentTreeContextMenuRequest | null>(null);
  const [pickerSession, setPickerSession] = useState<TreeMoveSession | null>(null);
  const pickerSessionRef = useRef<TreeMoveSession | null>(null);
  const openPicker = (session: TreeMoveSession) => { pickerSessionRef.current = session; setPickerSession(session); };
  const canDrop = (request: TreeMoveRequest) => resolveStructureMoveIntent(request, context, context) !== null;
  const performMove = (request: TreeMoveRequest): TreeMoveResult => {
    try {
      const intent = requireStructureMoveIntent(request, context, context);
      move(intent.sourceBlockIds, intent.target);
      clearSelection();
      return { status: "success" };
    } catch (error) {
      return { status: "failure", message: error instanceof Error ? error.message : "无法移动结构块。" };
    }
  };
  const releaseAfterClose = (session: TreeMoveSession | null) => {
    if (session) queueMicrotask(() => {
      if (pickerSessionRef.current?.sessionId !== session.sessionId) scopeRef.current?.cancelMove(session.sessionId);
    });
  };
  return {
    scopeRef, menu, pickerSession, canDrop, performMove,
    openMenu: setMenu,
    closeMenu() { setMenu(null); releaseAfterClose(menu?.moveSession ?? null); },
    openPickerFromMenu() { if (menu?.moveSession) openPicker(menu.moveSession); },
    beginMove() {
      const session = scopeRef.current?.beginMove(context.sourceTreeId);
      if (session) openPicker(session);
    },
    closePicker() { pickerSessionRef.current = null; setPickerSession(null); releaseAfterClose(pickerSession); },
    requestMove(request: TreeMoveRequest) { void scopeRef.current?.requestMove(request); },
  };
}
