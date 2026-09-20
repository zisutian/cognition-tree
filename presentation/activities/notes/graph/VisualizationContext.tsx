import { RotateCcw } from "lucide-react";
import type {
  ReferenceGraphLocalDepth,
  VisualizationViewModel,
} from "../../../../application/workspace/index.ts";
import {
  Button,
  ChoiceGroup,
  createClassNames,
  FieldRow,
  FormLayout,
  InputControl,
  ToggleButton,
} from "../../../ui/index.ts";
import graphStyles from "./graph.module.css";
const cx = createClassNames(graphStyles);

import { VisualizationGraphSettings } from "./VisualizationGraphSettings.tsx";
import type { ReferenceGraphSession } from "./useReferenceGraphSession.ts";

export function VisualizationContext({
  session,
  view,
}: {
  session: ReferenceGraphSession;
  view: VisualizationViewModel;
}) {
  const { hideIsolated, localDepth, mode, query } = view.filter;

  return (
    <div
      aria-label="图谱控制"
      className={cx("activity-context-content graph-context")}
    >
      <FormLayout layout="compact">
        <FieldRow fieldId="graph-query" label="搜索">
          {(accessibility) => (
            <InputControl
              {...accessibility}
              aria-label="搜索笔记标题"
              placeholder="笔记标题"
              sizing="container"
              value={query}
              onChange={(event) => view.setQuery(event.target.value)}
            />
          )}
        </FieldRow>
        <FieldRow fieldId="graph-scope" label="范围" controlKind="group">
          {(accessibility) => (
            <ChoiceGroup
              {...accessibility}
              ariaLabel="图谱范围"
              mode="single"
              options={[
                { label: "全库", value: "global" },
                { label: "局部", value: "local" },
              ]}
              value={mode}
              onChange={view.setMode}
            />
          )}
        </FieldRow>
        {mode === "local" ? (
          <FieldRow fieldId="graph-depth" label="深度" controlKind="group">
            {(accessibility) => (
              <ChoiceGroup
                {...accessibility}
                ariaLabel="局部图谱深度"
                mode="single"
                options={[
                  { label: "1 层", value: "1" },
                  { label: "2 层", value: "2" },
                ]}
                value={String(localDepth)}
                onChange={(nextDepth) =>
                  view.setLocalDepth(
                    Number(nextDepth) as ReferenceGraphLocalDepth,
                  )
                }
              />
            )}
          </FieldRow>
        ) : null}
        <FieldRow fieldId="graph-isolated" label="筛选">
          {(accessibility) => (
            <ToggleButton
              {...accessibility}
              aria-label="隐藏孤立点"
              onClick={() => view.setHideIsolated(!hideIsolated)}
              pressed={hideIsolated}
            >
              隐藏孤立点
            </ToggleButton>
          )}
        </FieldRow>
      </FormLayout>
      <div className={cx("graph-context-actions")}>
        <Button
          aria-label="重置图谱视图"
          onClick={session.resetView}
          title="重置图谱视图"
          type="button"
          variant="secondary"
          sizing="container"
        >
          <RotateCcw aria-hidden="true" />
          重置视图
        </Button>
        <VisualizationGraphSettings
          settings={session.settings}
          onChange={session.updateSettings}
          onReset={session.resetSettings}
        />
      </div>
    </div>
  );
}
