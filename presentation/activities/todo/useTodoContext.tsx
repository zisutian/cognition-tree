import { Stack, Tree } from "compact-ui";
import { Button, InputControl } from "compact-ui";
import { ListChecks, Plus } from "lucide-react";
import { useState } from "react";
import type { TodoViewModel } from "../../../application/todo/index.ts";
import { usePageNavigation, describePage } from "../../navigation/index.ts";
import {
  getListReorderIndex,
  useFeedback,
  type ActivitySlots,
} from "../../ui/index.ts";
export function useTodoContext(view: TodoViewModel): {
  context: NonNullable<ActivitySlots["context"]>;
  creation: { disabled: boolean; begin(): void };
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
  return {
    creation,
    context: {
      title: "代办",
      layout: "canvas",
      actions: (
        <Button
          variant="icon"
          aria-label="新建事项集合"
          disabled={creation.disabled}
          onClick={creation.begin}
        >
          <Plus />
        </Button>
      ),
      content: (
        <Stack fill>
          <Tree
            label="事项集合"
            nodes={view.collections.map((item) => ({
              id: item.id,
              label: item.name,
              icon: <ListChecks />,
            }))}
            selectedId={view.activeCollection?.id ?? null}
            expandedIds={new Set()}
            onExpandedChange={() => {}}
            onSelect={() => {}}
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
              drag: view.canMutate,
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
            canDrop={(move) =>
              move.target.position === "before" ||
              move.target.position === "after"
            }
            onMove={(move) => {
              if (
                move.target.position !== "before" &&
                move.target.position !== "after"
              )
                return;
              const target = move.target;
              const sourceIndex = view.collections.findIndex(
                  (item) => item.id === move.sourceId,
                ),
                targetIndex = view.collections.findIndex(
                  (item) => item.id === target.id,
                );
              const source = find(move.sourceId);
              if (source && sourceIndex >= 0 && targetIndex >= 0)
                view.moveCollection(
                  source.id,
                  getListReorderIndex({
                    sourceIndex,
                    targetIndex,
                    placement:
                      target.position === "before" ? "before" : "after",
                  }),
                );
            }}
            onActionError={feedback.notifyError}
          />
          {creating ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
            >
              <Stack direction="row">
                <InputControl
                  autoFocus
                  aria-label="新建事项集合名称"
                  value={name}
                  error={error || undefined}
                  onChange={(event) => {
                    setName(event.target.value);
                    setError("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setCreating(false);
                  }}
                />
                <Button type="submit">确定</Button>
                <Button onClick={() => setCreating(false)}>取消</Button>
              </Stack>
            </form>
          ) : null}
        </Stack>
      ),
    },
  };
}
