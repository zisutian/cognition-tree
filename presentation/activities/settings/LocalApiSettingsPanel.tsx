import { createClassNames } from "../../ui/index.ts";
import settingsStyles from "./settings.module.css";
const cx = createClassNames(settingsStyles);
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useRef, useState } from "react";
import type {
  ContentOperationResult,
  LocalContentAccess,
} from "../../../application/operations/index.ts";
import {
  Button,
  FieldRow,
  FormLayout,
  InputControl,
  Section,
  SectionStack,
  ToolPropertyList,
  ToolPropertyRow,
} from "../../ui/index.ts";
import { SettingsPage } from "./SettingsPage.tsx";
import {
  useSettingsInteraction,
  type SettingsInteractionReporter,
} from "./useSettingsInteraction.ts";

const statusLabels: Record<ContentOperationResult["status"], string> = {
  pending: "执行中",
  committed: "已提交",
  conflict: "版本冲突，未提交",
  failed: "已拒绝",
  indeterminate: "结果尚未确认",
};

export function LocalApiSettingsPanel({
  api,
  report,
}: {
  api: LocalContentAccess;
  report: SettingsInteractionReporter;
}) {
  const [operationId, setOperationId] = useState("");
  const [result, setResult] = useState<ContentOperationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current += 1;
    },
    [api],
  );
  useSettingsInteraction(report, { errorMessage });
  const query = async () => {
    const current = ++generation.current;
    setLoading(true);
    setResult(null);
    setErrorMessage(null);
    try {
      const receipt = await api.getOperation(operationId.trim());
      if (generation.current === current) setResult(receipt);
    } catch (error) {
      if (generation.current === current)
        setErrorMessage(error instanceof Error ? error.message : "查询失败");
    } finally {
      if (generation.current === current) setLoading(false);
    }
  };
  return (
    <SettingsPage label="本机 API" errorMessage={errorMessage}>
      <SectionStack>
        <Section>
          <FormLayout layout="stacked">
            <FieldRow fieldId="local-api-origin" label="服务地址">
              {(attributes) => (
                <InputControl
                  {...attributes}
                  readOnly
                  value={api.serviceOrigin}
                />
              )}
            </FieldRow>
          </FormLayout>
        </Section>
        <Section title="查询操作结果">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void query();
            }}
          >
            <FormLayout layout="stacked">
              <FieldRow fieldId="local-api-operation" label="操作 ID">
                {(attributes) => (
                  <InputControl
                    {...attributes}
                    value={operationId}
                    onChange={(event) => {
                      generation.current += 1;
                      setOperationId(event.currentTarget.value);
                      setResult(null);
                      setLoading(false);
                      setErrorMessage(null);
                    }}
                  />
                )}
              </FieldRow>
              <Button type="submit" disabled={loading || !operationId.trim()}>
                {loading ? "查询中…" : "查询结果"}
              </Button>
            </FormLayout>
          </form>
          {result ? (
            <div aria-label="操作结果" role="status">
              <ToolPropertyList>
                <ToolPropertyRow label="操作 ID" value={result.operationId} />
                <ToolPropertyRow
                  label="结果"
                  value={statusLabels[result.status]}
                />
                <ToolPropertyRow
                  label="审计"
                  value={
                    result.audit === "recorded"
                      ? "已记录"
                      : result.audit === "failed"
                        ? "收尾失败，内容提交状态见上方"
                        : "待完成"
                  }
                />
              </ToolPropertyList>
              {result.error ? <p>{result.error.message}</p> : null}
              {result.review?.resources.map((resource) => (
                <p key={`${resource.type}:${resource.resourceId}`}>
                  {resource.after?.path ?? resource.before?.path} ·{" "}
                  {resource.actions.join("、")}
                </p>
              ))}
              <details>
                <summary>提交详情</summary>
                <pre className={cx("local-api-example")}>
                  {JSON.stringify(result, null, 2)}
                </pre>
              </details>
            </div>
          ) : null}
        </Section>
      </SectionStack>
    </SettingsPage>
  );
}
