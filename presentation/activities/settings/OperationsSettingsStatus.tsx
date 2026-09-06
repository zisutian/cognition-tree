// SPDX-License-Identifier: GPL-3.0-or-later

import {
  ToolPropertyList,
  ToolPropertyRow,
  ToolSection,
  ToolSectionStack,
} from "../../ui/index.ts";
import type { OperationsSettingsStatusView } from "./useOperationsSettingsSession.ts";
import {
  operationResultLabel,
  operationSourceLabel,
} from "./operationAuditPresentation.ts";

export function OperationsSettingsStatus({
  session,
}: {
  session: OperationsSettingsStatusView;
}) {
  const { snapshot } = session;
  const entry =
    snapshot.entries.find(({ id }) => id === snapshot.selectedEntryId) ?? null;

  if (!entry) {
    return (
      <ToolSection title="审计">
        <ToolPropertyList aria-label="审计状态">
          <ToolPropertyRow
            label="状态"
            value={
              snapshot.loading
                ? "载入中"
                : snapshot.status?.status === "unavailable"
                  ? "不可用"
                  : "就绪"
            }
          />
          <ToolPropertyRow label="记录" value={snapshot.entries.length} />
          {snapshot.status?.status === "unavailable" ? (
            <ToolPropertyRow label="原因" value={snapshot.status.message} />
          ) : null}
          {snapshot.errorMessage ? (
            <ToolPropertyRow label="错误" value={snapshot.errorMessage} />
          ) : null}
        </ToolPropertyList>
      </ToolSection>
    );
  }
  return (
    <ToolSectionStack>
      <ToolSection title={new Date(entry.updatedAt).toLocaleString()}>
        <ToolPropertyList aria-label="审计记录状态">
          <ToolPropertyRow
            label="来源"
            value={operationSourceLabel(entry.source)}
          />
          <ToolPropertyRow
            label="结果"
            value={operationResultLabel(entry.result)}
          />
          <ToolPropertyRow label="资源" value={entry.resourceIds.length} />
          <ToolPropertyRow label="块" value={entry.blockIds.length} />
        </ToolPropertyList>
      </ToolSection>
      <details key={entry.id}>
        <summary>技术详情</summary>
        <ToolPropertyList aria-label="操作技术详情">
          <ToolPropertyRow label="路由" value={<code>{entry.route}</code>} />
          <ToolPropertyRow
            label="请求 ID"
            value={<code>{entry.requestId}</code>}
          />
          <ToolPropertyRow label="操作 ID" value={<code>{entry.id}</code>} />
          <ToolPropertyRow
            label="提交前 revision"
            value={<code>{entry.beforeRevision}</code>}
          />
          <ToolPropertyRow
            label="提交后 revision"
            value={<code>{entry.afterRevision ?? "—"}</code>}
          />
          {entry.source === "agent" ? (
            <>
              <ToolPropertyRow
                label="Proposal"
                value={
                  <code>
                    {entry.technical.proposalId} v
                    {entry.technical.proposalVersion}
                  </code>
                }
              />
              <ToolPropertyRow
                label="Runtime"
                value={`${entry.technical.runtimeKind} · ${entry.technical.profileId} v${entry.technical.profileVersion}`}
              />
              <ToolPropertyRow
                label="Digest"
                value={<code>{entry.technical.digest}</code>}
              />
            </>
          ) : (
            <ToolPropertyRow
              label="Intent digest"
              value={<code>{entry.technical.intentDigest}</code>}
            />
          )}
        </ToolPropertyList>
      </details>
    </ToolSectionStack>
  );
}
