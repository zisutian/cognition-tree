import { FieldRow, FormActions, FormLayout, Stack, Tree, TreeDragScope, type TreeMoveRequest } from "compact-ui";
import { Button, InputControl } from "compact-ui";
import { ListChecks, Plus } from "lucide-react";
import { useState } from "react";
import type { TodoViewModel } from "../../../application/todo/index.ts";
import { usePageNavigation, describePage } from "../../navigation/index.ts";
import {
  getListReorderIndex,
  useFeedback,
  type ActivitySlots,
  useSingleTreeSelection,
} from "../../ui/index.ts";
export function useTodoContext(view: TodoViewModel): {
  context: NonNullable<ActivitySlots["context"]>;
} {
  const feedback = useFeedback(),
    pages = usePageNavigation();
  const [creating, setCreating] = useState(false),
    [name, setName] = useState(""),
    [error, setError] = useState("");
  const creation = {
    disabled: creating || !view.canMutate,
    begin() {
      if (!view.canMutate) return;
      setCreating(true);
      setName("");
      setError("");
    },
  };
  const find = (id: string) => view.collections.find((item) => item.id === id);
  const submit = () => {
    if (!name.trim()) {
      setError("名称不能为空。");
      return;
    }
    const result = feedback.runAction(() => {
      pages.created("todo", () => view.createCollection(name));
      return true;
    });
    if (result) {
      setCreating(false);
      setName("");
    } else setError("创建失败");
  };
  const treeSelection = useSingleTreeSelection(view.activeCollection?.id ?? null);
  const treeId = "todo-collections";
  const contentKey = "todo-collections";
  const resolveMove = (move: TreeMoveRequest) => {
    if (!view.canMutate || move.source.treeId !== treeId || move.target.treeId !== treeId ||
      move.source.contentKey !== contentKey || move.target.contentKey !== contentKey ||
      move.source.nodeIds.length !== 1 || (move.target.position !== "before" && move.target.position !== "after")) return null;
    const sourceIndex = view.collections.findIndex((item) => item.id === move.source.nodeIds[0]);
    const targetId = move.target.nodeId;
    const targetIndex = view.collections.findIndex((item) => item.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return null;
    return { sourceId: view.collections[sourceIndex].id, targetIndex: getListReorderIndex({ sourceIndex, targetIndex, placement: move.target.position }) };
  };
  return {
    context: {
      title: "代办",
      layout: "canvas",
      actions: (
        <Button
          iconOnly
          appearance="plain"
          aria-label="新建事项集合"
          disabled={creation.disabled}
          onClick={creation.begin}
        >
          <Plus />
        </Button>
      ),
      content: (
        <Stack fill>
          {creating ? (
            <FormLayout
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
            >
              <FieldRow label="集合名称">
                {(accessibility) => (
                  <InputControl
                    {...accessibility}
                    sizing="fill"
                    autoFocus
                    aria-label="新建事项集合名称"
                    value={name}
                    error={error || undefined}
                    onChange={(event) => {
                      setName(event.target.value);
                      setError("");
                    }}
                    onKeyDown={(event) => {
                      if (
                        event.key !== "Escape" ||
                        event.nativeEvent.isComposing ||
                        event.nativeEvent.keyCode === 229
                      ) return;
                      event.preventDefault();
                      event.stopPropagation();
                      setCreating(false);
                    }}
                  />
                )}
              </FieldRow>
              <FormActions>
                <Button type="submit">确定</Button>
                <Button onClick={() => setCreating(false)}>取消</Button>
              </FormActions>
            </FormLayout>
          ) : null}
          <TreeDragScope onMoveRequest={(request) => {
            try {
              const intent = resolveMove(request);
              if (!intent) throw new Error("无法移动事项集合：源或目标已失效。");
              view.moveCollection(intent.sourceId, intent.targetIndex);
              return { status: "success" };
            } catch (error) {
              return { status: "failure", message: error instanceof Error ? error.message : "无法移动事项集合。" };
            }
          }}>
          <Tree
            aria-label="事项集合"
            nodes={view.collections.map((item) => ({
              id: item.id,
              label: item.name,
              icon: <ListChecks />,
            }))}
            expandedIds={new Set()}
            onExpandedChange={() => {}}
            {...treeSelection}
            onOpen={(id, intent) => {
              const item = find(id);
              if (item)
                pages.open(
                  describePage("todo", "todo-collection", id, item.name),
                  intent,
                  () => view.selectCollection(item.id),
                );
            }}
            capabilities={{
              rename: view.canMutate,
              delete: view.canMutate,
            }}
            onRename={(id, label) => {
              const item = find(id);
              if (!label.trim()) throw new Error("名称不能为空。");
              if (item) view.renameCollection(item.id, label);
            }}
            onDelete={(id) => {
              const item = find(id);
              if (item) view.deleteCollection(item.id);
            }}
            dragDrop={{ treeId, contentKey,
              canDrag: (id) => view.canMutate && !!find(id),
              canDrop: (request) => resolveMove(request) !== null,
            }}
            onActionError={feedback.notifyError}
          />
          </TreeDragScope>
        </Stack>
      ),
    },
  };
}
