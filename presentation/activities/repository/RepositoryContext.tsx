import { Stack, Tree, type TreeNode } from "compact-ui";
import { Button } from "compact-ui";
import { useEffect, useRef, useState } from "react";
import { Check, HardDrive, Plus, AlertTriangle } from "lucide-react";
import type {
  RepositoryFocusRequest,
  RepositorySelection,
  RepositoryViewModel,
} from "../../../application/repository/index.ts";
import {
  createDefaultRepositorySelection,
  projectRepositoryFocusSelection,
} from "../../../application/repository/index.ts";
import { useFeedback } from "../../ui/index.ts";
import { builtInIds, builtInLabel } from "./repositoryViewHelpers.ts";
export const repositoryTargetKey = (selection: RepositorySelection) =>
  selection.kind === "create" ? "create" : `${selection.kind}:${selection.id}`;
export function RepositoryContext({
  focusRequest,
  onConsumeFocusRequest,
  onSelectionChange = () => {},
  selection,
  view,
}: {
  focusRequest: RepositoryFocusRequest | null;
  onConsumeFocusRequest(id: number): void;
  onSelectionChange?(
    selection: RepositorySelection,
    intent?: "preview" | "pinned",
  ): void;
  selection?: RepositorySelection;
  view: RepositoryViewModel;
}) {
  const feedback = useFeedback(),
    host = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(["system", "local"]),
  );
  const current = selection ?? createDefaultRepositorySelection(view),
    targets = new Map<string, RepositorySelection>();
  const row = (
    target: RepositorySelection,
    label: string,
    icon?: TreeNode["icon"],
  ): TreeNode => {
    const id = repositoryTargetKey(target);
    targets.set(id, target);
    return { id, label, icon, disabled: view.operation !== "idle" };
  };
  const nodes: TreeNode[] = [
    {
      id: "system",
      label: "内置数据",
      canHaveChildren: true,
      children: builtInIds.map((id) => {
        const item = view.builtIns.find((item) => item.id === id),
          issue = view.builtInIssues.find((item) => item.id === id);
        const problem =
          !!issue ||
          !!item?.hasProblem ||
          view.builtInCatalogStatus === "failed";
        const status = issue
          ? "故障"
          : item?.hasProblem
            ? item.statusLabel
            : view.builtInCatalogStatus === "loading"
              ? "载入中"
              : problem
                ? "故障"
                : item
                  ? "受保护"
                  : "不可用";
        return row(
          { kind: "built-in", id },
          `${builtInLabel(id)} · ${status}`,
          problem ? (
            <AlertTriangle aria-label={`${builtInLabel(id)}数据存在问题`} />
          ) : (
            <HardDrive />
          ),
        );
      }),
    },
    {
      id: "local",
      label: "本地",
      canHaveChildren: true,
      children: [
        ...view.repositories.map((item) => {
          const active = item.id === view.activeRepositoryId,
            problem = active && !!view.activeSessionErrorMessage;
          return row(
            { kind: "ordinary-repository", id: item.id },
            item.label,
            problem ? (
              <AlertTriangle aria-label="仓库运行状态存在问题" />
            ) : active ? (
              <Check aria-label="当前仓库" />
            ) : (
              <HardDrive />
            ),
          );
        }),
        ...view.issues.map((item) =>
          row(
            { kind: "ordinary-issue", id: item.id },
            `${item.displayLabel} · 故障`,
            <AlertTriangle />,
          ),
        ),
      ],
    },
  ];
  useEffect(() => {
    if (!focusRequest) return;
    onSelectionChange(projectRepositoryFocusSelection(focusRequest));
    host.current?.querySelector<HTMLElement>('[role="tree"]')?.focus();
    onConsumeFocusRequest(focusRequest.requestId);
  }, [focusRequest]);
  return (
    <div ref={host} style={{ height: "100%", minHeight: 0 }}>
      <Stack fill>
        <Button
          iconOnly
          aria-label="新建仓库"
          onClick={() => onSelectionChange({ kind: "create" })}
        >
          <Plus />
        </Button>
        <Tree
          aria-label="仓库目录"
          nodes={nodes}
          selectedId={repositoryTargetKey(current)}
          expandedIds={expanded}
          onExpandedChange={setExpanded}
          onSelect={() => {}}
          onOpen={(id, intent) => {
            const target = targets.get(id);
            if (target) onSelectionChange(target, intent);
          }}
          capabilities={{
            rename: (node) =>
              node.id.startsWith("ordinary-repository:") &&
              view.operation === "idle",
          }}
          onRename={async (id, name) => {
            const target = targets.get(id);
            if (target?.kind === "ordinary-repository")
              await view.renameRepository({ id: target.id, name: name.trim() });
          }}
          onActionError={feedback.notifyError}
        />
      </Stack>
    </div>
  );
}
