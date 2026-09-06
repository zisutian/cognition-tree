// SPDX-License-Identifier: GPL-3.0-or-later

import type { SystemConfigurationState } from "../../../application/system";
import { Button, EmptyState } from "../../ui/shared/primitives";
import { StatusBadge } from "../../ui/shared/StatusPresentation";
import {
  ToolPropertyList,
  ToolPropertyRow,
  ToolSection,
  ToolSectionStack,
} from "../../ui/shared/ToolSurface";
import type { SystemOwnerCredentialStatusView } from "./useSystemOwnerCredentialSession";

export function SystemSettingsStatus({ ownerCredentialSession, state }: {
  ownerCredentialSession: SystemOwnerCredentialStatusView;
  state: SystemConfigurationState;
}) {
  const phaseLabels = { preparing: "准备", copying: "复制", verifying: "校验", committing: "切换指针", reconciling: "核对写入结果", restarting: "等待重启", completed: "已完成", failed: "未完成，源目录继续使用", "recovery-required": "需要恢复" } as const;
  const snapshot = state.configuration;
  const ownerCredentialPreparation = ownerCredentialSession.snapshot.preparation;

  if (!snapshot) {
    return <EmptyState compact description={state.errorMessage ?? "正在读取服务状态。"} title="服务状态不可用" />;
  }
  const nextAddress = snapshot.configuration.listenMode === "lan"
    ? snapshot.configuration.publicOrigin
    : `http://127.0.0.1:${snapshot.configuration.port}`;

  return (
    <ToolSectionStack>
      <ToolSection title="服务">
        <ToolPropertyList aria-label="服务状态">
          <ToolPropertyRow
            label="状态"
            value={(
              <StatusBadge tone={snapshot.runtimeApplyErrorMessage ? "danger" : snapshot.restartRequired ? "warning" : "success"}>
                {snapshot.runtimeApplyErrorMessage ? "部分生效" : snapshot.restartRequired ? "等待重启" : "已生效"}
              </StatusBadge>
            )}
          />
          <ToolPropertyRow label="当前监听" value={`${snapshot.effectiveConfiguration.listenMode === "loopback" ? "仅本机" : "局域网"} · ${snapshot.effectiveConfiguration.port}`} />
          <ToolPropertyRow label="当前数据根" value={<code>{snapshot.effectiveConfiguration.dataRoot}</code>} />
          <ToolPropertyRow label="当前审计上限" value={snapshot.effectiveConfiguration.maxAuditEntries} />
          <ToolPropertyRow label="访问地址" value={<code>{nextAddress}</code>} />
          {snapshot.runtimeApplyErrorMessage ? <ToolPropertyRow label="应用错误" value={snapshot.runtimeApplyErrorMessage} /> : null}
        </ToolPropertyList>
      </ToolSection>
      <ToolSection title="所有者凭据">
        <ToolPropertyList aria-label="所有者凭据状态">
          <ToolPropertyRow
            label="凭据"
            value={(
              <StatusBadge tone={snapshot.ownerCredentialConfigured ? "success" : "warning"}>
                {snapshot.ownerCredentialConfigured ? "已创建" : "未创建"}
              </StatusBadge>
            )}
          />
          <ToolPropertyRow label="待处理轮换" value={snapshot.ownerCredentialRotationPending ? "有" : "无"} />
          {ownerCredentialPreparation ? (
            <ToolPropertyRow
              actions={<Button disabled={state.operationStatus === "working"} onClick={ownerCredentialSession.dismissSecret} type="button">关闭显示</Button>}
              label={ownerCredentialSession.snapshot.activationStatus === "activated" ? "已激活新密钥" : "待激活新密钥"}
              value={<code>{ownerCredentialPreparation.secret}</code>}
            />
          ) : null}
        </ToolPropertyList>
      </ToolSection>
      {state.migration ? (
        <ToolSection title="数据根迁移">
          <ToolPropertyList aria-label="数据根迁移状态">
            <ToolPropertyRow label="状态" value={phaseLabels[state.migration.status]} />
            <ToolPropertyRow label="源目录" value={<code>{state.migration.source}</code>} />
            <ToolPropertyRow label="目标目录" value={<code>{state.migration.destination}</code>} />
            {state.migration.errorMessage ? <ToolPropertyRow label="错误" value={state.migration.errorMessage} /> : null}
          </ToolPropertyList>
        </ToolSection>
      ) : null}
    </ToolSectionStack>
  );
}
