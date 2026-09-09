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
  ToolPropertyList,
  ToolPropertyRow,
  ToolSection,
  ToolSectionStack,
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
    <SettingsPage title="本机 API" errorMessage={errorMessage}>
      <ToolSectionStack>
        <ToolSection title="连接与能力">
          <FormLayout layout="stacked">
            <FieldRow
              fieldId="local-api-origin"
              label="服务地址"
              description="本机调用不需要密钥。请求仍会校验连接来源、Host 和 Origin；携带旧 Bearer 的请求会被拒绝。"
            >
              {(attributes) => (
                <InputControl
                  {...attributes}
                  readOnly
                  value={api.serviceOrigin}
                />
              )}
            </FieldRow>
          </FormLayout>
          <p>
            支持笔记、日记、待办、仓库管理及 CTN
            语法。系统配置、凭据和数据迁移继续在设置中管理。
          </p>
          <p>
            以仓库名称、笔记标题或目录中的相对路径定位。同名时提供完整相对路径；读取结果包含提交所需版本。
          </p>
        </ToolSection>
        <ToolSection title="调用方式">
          <p>
            在对话中确认修改后，由本机客户端直接提交。内置智能体仍使用原有提案审批。
          </p>
          <pre className="local-api-example">{`./ctn --server ${api.serviceOrigin} catalog\n./ctn --server ${api.serviceOrigin} directory workspace --repository '仓库名称' > read.json\n./ctn --server ${api.serviceOrigin} apply --from read.json --file command.json`}</pre>
          <p>
            每次修改复用读取结果中的完整 basis（身份与版本）。CLI 可通过 --from
            读取，自动生成操作 ID
            并在发送前显示。版本过期时重新读取并确认修改；结果不确定时先查询收据和受影响内容，不自动重放。
          </p>
        </ToolSection>
        <ToolSection title="查询操作结果">
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
                <pre className="local-api-example">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </details>
            </div>
          ) : null}
        </ToolSection>
      </ToolSectionStack>
    </SettingsPage>
  );
}
