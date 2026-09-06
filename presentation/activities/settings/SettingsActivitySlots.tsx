// SPDX-License-Identifier: GPL-3.0-or-later

import "./settings.css";
import type { ActivitySlots } from "../../ui/activityTypes";
import {
  SettingsContext,
  SettingsPanel,
  type SettingsWorkbenchPreferences,
} from "./SettingsPanel";
import type { AgentApplication } from "../../../application/agent";
import type { SystemApplication } from "../../../application/system";
import {
  SettingsStatusPanel,
} from "./SettingsStatusPanel";
import type {
  AgentSettingsRoute,
  ApiAccessSelection,
  SettingsSection,
} from "./settingsTypes";
import type {
  ApiAccessSettingsView,
} from "./useApiAccessSettingsSession";
import type {
  SystemOwnerCredentialView,
} from "./useSystemOwnerCredentialSession";
import type {
  OperationsSettingsPanelView,
  OperationsSettingsStatusView,
  OperationsSettingsView,
} from "./useOperationsSettingsSession";
import type {
  SystemSettingsPanelApplication,
} from "./SystemSettingsPanel";

export function createSettingsActivitySlots({
  agent,
  agentRoute,
  apiAccessSession,
  apiAccessSelection = { kind: "overview" },
  onAgentRouteChange,
  onApiAccessSelectionChange = () => undefined,
  onCollapseDetail,
  onSectionChange = () => undefined,
  operationsSession,
  section = "interface",
  system,
  systemOwnerCredentialSession,
  workbench,
}: {
  agent: AgentApplication;
  agentRoute: AgentSettingsRoute;
  apiAccessSession: ApiAccessSettingsView;
  apiAccessSelection?: ApiAccessSelection;
  onAgentRouteChange(route: AgentSettingsRoute): void;
  onApiAccessSelectionChange?(selection: ApiAccessSelection): void;
  onCollapseDetail(): void;
  onSectionChange?(section: SettingsSection): void;
  operationsSession: OperationsSettingsView;
  section?: SettingsSection;
  system: SystemApplication;
  systemOwnerCredentialSession: SystemOwnerCredentialView;
  workbench: SettingsWorkbenchPreferences;
}): ActivitySlots {
  const systemSettings = {
    authenticationController: {
      logout: () => system.authenticationController.logout(),
    },
    configurationController: {
      getSnapshot: () => system.configurationController.getSnapshot(),
      load: () => system.configurationController.load(),
      reconcileMigration: () => system.configurationController.reconcileMigration(),
      migrateDataRoot: (destination: string) =>
        system.configurationController.migrateDataRoot(destination),
      update: (request) => system.configurationController.update(request),
    },
    configurationState: system.configurationState,
  } satisfies SystemSettingsPanelApplication;
  const operationsPanelSession = {
    load: operationsSession.load,
    selectEntry: operationsSession.selectEntry,
    snapshot: operationsSession.snapshot,
  } satisfies OperationsSettingsPanelView;
  const operationsStatusSession = {
    snapshot: operationsSession.snapshot,
  } satisfies OperationsSettingsStatusView;

  return {
    context: {
      content: (
        <SettingsContext
          onSectionChange={onSectionChange}
          section={section}
        />
      ),
      title: "设置",
    },
    detail: (
      <SettingsStatusPanel
        agent={agent}
        agentRoute={agentRoute}
        apiAccessSession={apiAccessSession}
        apiAccessSelection={apiAccessSelection}
        onCollapseDetail={onCollapseDetail}
        operationsSession={operationsStatusSession}
        section={section}
        systemConfigurationState={system.configurationState}
        systemOwnerCredentialSession={{
          dismissSecret: systemOwnerCredentialSession.dismissSecret,
          snapshot: systemOwnerCredentialSession.snapshot,
        }}
      />
    ),
    main: (
      <SettingsPanel
        agent={agent}
        agentRoute={agentRoute}
        apiAccessSession={apiAccessSession}
        apiAccessSelection={apiAccessSelection}
        onAgentRouteChange={onAgentRouteChange}
        onApiAccessSelectionChange={onApiAccessSelectionChange}
        operationsSession={operationsPanelSession}
        section={section}
        system={systemSettings}
        systemOwnerCredentialSession={{
          activatePreparedOwnerCredential:
            systemOwnerCredentialSession.activatePreparedOwnerCredential,
          clearOwnerCredential:
            systemOwnerCredentialSession.clearOwnerCredential,
          dismissSecret: systemOwnerCredentialSession.dismissSecret,
          prepareOwnerCredentialRotation:
            systemOwnerCredentialSession.prepareOwnerCredentialRotation,
          snapshot: systemOwnerCredentialSession.snapshot,
        }}
        workbench={workbench}
      />
    ),
  };
}
