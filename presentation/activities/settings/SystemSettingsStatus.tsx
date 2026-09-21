// SPDX-License-Identifier: GPL-3.0-or-later

import {
  PropertyList as ToolPropertyList,
  PropertyRow as ToolPropertyRow,
} from "compact-ui";

import type { SystemConfigurationState } from "../../../application/system/index.ts";

export function SystemSettingsStatus({
  page,
  state,
}: {
  page: "network" | "paths" | "owner" | "migration" | "audit-retention";
  state: SystemConfigurationState;
}) {
  const snapshot = state.configuration;
  if (!snapshot) return null;
  return (
    <section aria-label="服务状态">
      <ToolPropertyList>
        {page === "network" ? (
          <>
            <ToolPropertyRow
              label="状态"
              children={
                snapshot.runtimeApplyErrorMessage
                  ? "部分生效"
                  : snapshot.restartRequired
                    ? "等待重启"
                    : "已生效"
              }
            />
            <ToolPropertyRow
              label="当前监听"
              children={`${snapshot.effectiveConfiguration.listenMode === "loopback" ? "仅本机" : "局域网"} · ${snapshot.effectiveConfiguration.port}`}
            />
            <ToolPropertyRow
              label="访问地址"
              children={
                <code>
                  {snapshot.configuration.listenMode === "lan"
                    ? snapshot.configuration.publicOrigin
                    : `http://127.0.0.1:${snapshot.configuration.port}`}
                </code>
              }
            />
            {snapshot.runtimeApplyErrorMessage ? (
              <ToolPropertyRow
                label="应用错误"
                children={snapshot.runtimeApplyErrorMessage}
              />
            ) : null}
          </>
        ) : page === "paths" ? (
          <>
            <ToolPropertyRow
              label="显示路径"
              children={
                <code>
                  {snapshot.effectiveConfiguration.repositoryHostRoot ??
                    "使用服务端路径"}
                </code>
              }
            />
            <ToolPropertyRow
              label="数据根"
              children={<code>{snapshot.effectiveConfiguration.dataRoot}</code>}
            />
          </>
        ) : page === "owner" ? (
          <>
            <ToolPropertyRow
              label="凭据"
              children={
                snapshot.ownerCredentialConfigured ? "已创建" : "未创建"
              }
            />
            <ToolPropertyRow
              label="待处理轮换"
              children={snapshot.ownerCredentialRotationPending ? "有" : "无"}
            />
          </>
        ) : page === "audit-retention" ? (
          <ToolPropertyRow
            label="当前审计上限"
            children={snapshot.effectiveConfiguration.maxAuditEntries}
          />
        ) : (
          <ToolPropertyRow
            label="迁移编号"
            children={<code>{state.migration?.id ?? "暂无迁移"}</code>}
          />
        )}
      </ToolPropertyList>
    </section>
  );
}
