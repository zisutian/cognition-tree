// SPDX-License-Identifier: GPL-3.0-or-later

import {
  Stack as SectionStack,
  PropertyList as ToolPropertyList,
  PropertyRow as ToolPropertyRow,
} from "compact-ui";
import { Section } from "compact-ui";

import {
  operationResultLabel,
  operationSourceLabel,
} from "./operationAuditPresentation.ts";
import type { OperationsSettingsStatusView } from "./useOperationsSettingsSession.ts";

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
      <Section title="审计">
        <section aria-label="审计状态">
          <ToolPropertyList>
            <ToolPropertyRow
              label="状态"
              children={
                snapshot.loading
                  ? "载入中"
                  : snapshot.status?.status === "unavailable"
                    ? "不可用"
                    : "就绪"
              }
            />
            <ToolPropertyRow label="记录" children={snapshot.entries.length} />
            {snapshot.status?.status === "unavailable" ? (
              <ToolPropertyRow
                label="原因"
                children={snapshot.status.message}
              />
            ) : null}
            {snapshot.errorMessage ? (
              <ToolPropertyRow label="错误" children={snapshot.errorMessage} />
            ) : null}
          </ToolPropertyList>
        </section>
      </Section>
    );
  }
  return (
    <SectionStack>
      <Section title={new Date(entry.updatedAt).toLocaleString()}>
        <section aria-label="审计记录状态">
          <ToolPropertyList>
            <ToolPropertyRow
              label="来源"
              children={operationSourceLabel(entry.source)}
            />
            <ToolPropertyRow
              label="结果"
              children={operationResultLabel(entry.result)}
            />
            <ToolPropertyRow label="资源" children={entry.resourceIds.length} />
            <ToolPropertyRow label="块" children={entry.blockIds.length} />
          </ToolPropertyList>
        </section>
      </Section>
      <details key={entry.id}>
        <summary>技术详情</summary>
        <section aria-label="操作技术详情">
          <ToolPropertyList>
            <ToolPropertyRow
              label="路由"
              children={<code>{entry.route}</code>}
            />
            <ToolPropertyRow
              label="请求 ID"
              children={<code>{entry.requestId}</code>}
            />
            <ToolPropertyRow
              label="操作 ID"
              children={<code>{entry.id}</code>}
            />
            <ToolPropertyRow
              label="提交前 revision"
              children={<code>{entry.beforeRevision}</code>}
            />
            <ToolPropertyRow
              label="提交后 revision"
              children={<code>{entry.afterRevision ?? "—"}</code>}
            />
            {entry.source === "agent" ? (
              <>
                <ToolPropertyRow
                  label="Proposal"
                  children={
                    <code>
                      {entry.technical.proposalId} v
                      {entry.technical.proposalVersion}
                    </code>
                  }
                />
                <ToolPropertyRow
                  label="Runtime"
                  children={`${entry.technical.runtimeKind} · ${entry.technical.profileId} v${entry.technical.profileVersion}`}
                />
                <ToolPropertyRow
                  label="Digest"
                  children={<code>{entry.technical.digest}</code>}
                />
              </>
            ) : (
              <ToolPropertyRow
                label="Intent digest"
                children={<code>{entry.technical.intentDigest}</code>}
              />
            )}
          </ToolPropertyList>
        </section>
      </details>
    </SectionStack>
  );
}
