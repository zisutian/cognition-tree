import { Stack, Tree, type TreeNode } from "compact-ui";
import { Button } from "compact-ui";
import { Check, Plus } from "lucide-react";
import { useState } from "react";
import type { SyntaxViewModel } from "../../../application/syntax/index.ts";
import { useFeedback } from "../../ui/index.ts";
import { usePageNavigation, describePage } from "../../navigation/index.ts";
export function SyntaxContext({ view }: { view: SyntaxViewModel }) {
  const feedback = useFeedback(),
    pages = usePageNavigation(),
    [expanded, setExpanded] = useState<ReadonlySet<string>>(
      () => new Set(["system", "workspace"]),
    );
  const selected =
    view.selectedTarget.kind === "workspace-file"
      ? view.selectedTarget.fileId
      : view.selectedTarget.kind;
  const current = view.files.find((file) => file.isSelected);
  const nodes: TreeNode[] = [
    {
      id: "system",
      label: "系统语法",
      canHaveChildren: true,
      children: view.systemConfigurations.map((item) => ({
        id: item.owner,
        label: item.label,
        disabled: !item.available || (view.hasDraftErrors && !item.isSelected),
      })),
    },
    {
      id: "workspace",
      label: "笔记库语法",
      canHaveChildren: true,
      children: view.files.map((file) => ({
        id: file.id,
        label: file.name + (file.hasErrors ? " · 错误" : ""),
        icon: file.isActive ? <Check aria-label="已启用语法" /> : undefined,
        disabled: view.hasDraftErrors && !file.isSelected,
      })),
    },
  ];
  return (
    <Stack fill>
      <Stack direction="row">
        <Button
          iconOnly
          aria-label="新建笔记库语法"
          disabled={view.hasDraftErrors || !view.workspaceCanMutate}
          onClick={() =>
            void feedback.runAction(() =>
              pages.created("syntax", view.createFile),
            )
          }
        >
          <Plus />
        </Button>
        {current && !current.isActive ? (
          <Button
            aria-label={`启用语法 ${current.name}`}
            disabled={view.hasDraftErrors || !view.workspaceCanMutate}
            onClick={() =>
              void feedback.runAction(() => view.activateFile(current.id))
            }
          >
            启用语法 {current.name}
          </Button>
        ) : null}
      </Stack>
      <Tree
        aria-label="语法设置"
        nodes={nodes}
        selectedId={selected}
        expandedIds={expanded}
        onExpandedChange={setExpanded}
        onSelect={() => {}}
        onOpen={(id, intent) => {
          const file = view.files.find((item) => item.id === id);
          const system = view.systemConfigurations.find(
            (item) => item.owner === id,
          );
          if (file)
            pages.open(
              describePage(
                "syntax",
                "syntax",
                file.id,
                file.name,
                pages.getRepositoryId(),
              ),
              intent,
              () =>
                view.selectTarget({ kind: "workspace-file", fileId: file.id }),
            );
          else if (system)
            pages.open(
              describePage(
                "syntax",
                "syntax",
                system.owner,
                `${system.label}语法`,
              ),
              intent,
              () => view.selectTarget({ kind: system.owner }),
            );
        }}
        capabilities={{
          rename: (node) => view.workspaceCanMutate && node.id === current?.id,
          delete: (node) =>
            view.workspaceCanMutate &&
            !view.hasDraftErrors &&
            view.files.some((item) => item.id === node.id),
        }}
        onRename={(id, name) => {
          if (!name.trim()) throw new Error("语法名称不能为空。");
          if (name.length > view.constraints.name.maxLength)
            throw new Error("语法名称过长。");
          if (view.files.some((item) => item.id !== id && item.name === name))
            throw new Error("语法名称已存在。");
          if (current?.id !== id || !view.actions)
            throw new Error("请先选择语法");
          view.actions.updateName(name);
        }}
        onDelete={(id) => view.deleteFile(id)}
        onActionError={feedback.notifyError}
      />
    </Stack>
  );
}
