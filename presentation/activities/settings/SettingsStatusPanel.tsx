// SPDX-License-Identifier: GPL-3.0-or-later

import type { AgentApplication } from "../../../application/agent";
import type { SystemConfigurationState } from "../../../application/system";
import { EmptyState } from "../../ui/shared/primitives";
import {
  ToolDetailPanel,
  ToolPanelBody,
} from "../../ui/shared/ToolSurface";
import { AgentSettingsStatus } from "./AgentSettingsStatus";
import { ApiAccessSettingsStatus } from "./ApiAccessSettingsStatus";
import { OperationsSettingsStatus } from "./OperationsSettingsStatus";
import type {
  AgentSettingsRoute,
  ApiAccessSelection,
  SettingsSection,
} from "./settingsTypes";
import { SystemSettingsStatus } from "./SystemSettingsStatus";
import type { ApiAccessSettingsStatusView } from "./useApiAccessSettingsSession";
import type { OperationsSettingsStatusView } from "./useOperationsSettingsSession";
import type { SystemOwnerCredentialStatusView } from "./useSystemOwnerCredentialSession";

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
    <ToolDetailPanel
      aria-label="设置状态"
      onCollapse={onCollapseDetail}
      title="状态"
    >
      <ToolPanelBody layout="detail">{content}</ToolPanelBody>
    </ToolDetailPanel>
  );
}
