// SPDX-License-Identifier: GPL-3.0-or-later

import type { AgentApplication } from "../../../application/agent/index.ts";
import type { SystemConfigurationState } from "../../../application/system/index.ts";
import {
  EmptyState,
  DetailPanel,
  ToolPanelBody,
} from "../../ui/index.ts";

import { AgentSettingsStatus } from "./AgentSettingsStatus.tsx";
import { ApiAccessSettingsStatus } from "./ApiAccessSettingsStatus.tsx";
import { OperationsSettingsStatus } from "./OperationsSettingsStatus.tsx";
import type {
  AgentSettingsRoute,
  ApiAccessSelection,
  SettingsSection,
} from "./settingsTypes.ts";
import { SystemSettingsStatus } from "./SystemSettingsStatus.tsx";
import type { ApiAccessSettingsStatusView } from "./useApiAccessSettingsSession.ts";
import type { OperationsSettingsStatusView } from "./useOperationsSettingsSession.ts";
import type { SystemOwnerCredentialStatusView } from "./useSystemOwnerCredentialSession.ts";

export function SettingsStatusPanel({
  agent,
  agentRoute,
  apiAccessSession,
  apiAccessSelection,
  onCollapseDetail,
  operationsSession,
  section,
  systemConfigurationState,
  systemOwnerCredentialSession,
}: {
  agent: AgentApplication;
  agentRoute: AgentSettingsRoute;
  apiAccessSession: ApiAccessSettingsStatusView;
  apiAccessSelection: ApiAccessSelection;
  onCollapseDetail: () => void;
  operationsSession: OperationsSettingsStatusView;
  section: SettingsSection;
  systemConfigurationState: SystemConfigurationState;
  systemOwnerCredentialSession: SystemOwnerCredentialStatusView;
}) {
  const content = section === "system"
    ? (
      <SystemSettingsStatus
        ownerCredentialSession={systemOwnerCredentialSession}
        state={systemConfigurationState}
      />
    )
    : section === "agent"
      ? <AgentSettingsStatus agent={agent} route={agentRoute} />
      : section === "api-access"
        ? (
          <ApiAccessSettingsStatus
            selection={apiAccessSelection}
            session={apiAccessSession}
          />
        )
        : section === "audit"
          ? <OperationsSettingsStatus session={operationsSession} />
          : <EmptyState compact title="当前页面没有状态对象" />;

  return (
    <DetailPanel
      aria-label="设置状态"
      onCollapse={onCollapseDetail}
      title="状态"
    >
      <ToolPanelBody layout="detail">{content}</ToolPanelBody>
    </DetailPanel>
  );
}
