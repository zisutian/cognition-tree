// SPDX-License-Identifier: GPL-3.0-or-later

import type { AgentApplication } from "../../../application/agent/index.ts";
import type { ApiAccessApplication } from "../../../application/apiAccess/index.ts";
import type { OperationApplication } from "../../../application/operations/index.ts";
import type {
  SystemApplication,
  OwnerCredentialRotationActivation,
} from "../../../application/system/index.ts";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";

import { createSettingsActivitySlots } from "./SettingsActivitySlots.tsx";
import type {
  AgentSettingsRoute,
  ApiAccessSelection,
  SettingsSection,
} from "./settingsTypes.ts";
import type { ActivityControllerProps } from "../../ui/index.ts";
import {
  useApiAccessSettingsSession,
} from "./useApiAccessSettingsSession.ts";
import {
  useSystemOwnerCredentialSession,
} from "./useSystemOwnerCredentialSession.ts";
import {
  useOperationsSettingsSession,
} from "./useOperationsSettingsSession.ts";

export function SettingsActivityController({
  active,
  application,
  renderActivity,
}: SettingsActivityControllerProps) {
  const [section, setSection] = useState<SettingsSection>("interface");
  const [agentRoute, setAgentRoute] = useState<AgentSettingsRoute>({
    page: "overview",
  });
  const [apiAccessSelection, setApiAccessSelection] = useState<ApiAccessSelection>({
    kind: "overview",
  });
  const apiAccessSession = useApiAccessSettingsSession(application.apiAccess);
  const operationsSession = useOperationsSettingsSession(
    application.operations.administration,
  );
  const systemConfigurationController =
    application.system.configurationController;
  const systemOwnerCredentialController = useMemo(() => ({
    activateOwnerCredentialRotation: (
      activation: OwnerCredentialRotationActivation,
    ) =>
      systemConfigurationController.activateOwnerCredentialRotation(activation),
    clearOwnerCredential: () =>
      systemConfigurationController.clearOwnerCredential(),
    prepareOwnerCredentialRotation: () =>
      systemConfigurationController.prepareOwnerCredentialRotation(),
  }), [systemConfigurationController]);
  const systemOwnerCredentialSession = useSystemOwnerCredentialSession(
    systemOwnerCredentialController,
  );
  const apiAccessActive = active && section === "api-access";
  const auditActive = active && section === "audit";
  const configuration = application.agent.configurationState.configuration;

  useEffect(() => {
    const providers = configuration?.providers ?? [];
    const profiles = configuration?.profiles ?? [];

    if (agentRoute.page === "overview") return;
    if (agentRoute.page === "providers") {
      const selectedProviderId = providers.some(
        ({ id }) => id === agentRoute.selectedProviderId,
      )
        ? agentRoute.selectedProviderId
        : providers[0]?.id ?? null;

      if (selectedProviderId !== agentRoute.selectedProviderId) {
        setAgentRoute({ page: "providers", selectedProviderId });
      }
      return;
    }

    const selectedProfileId = profiles.some(
      ({ id }) => id === agentRoute.selectedProfileId,
    )
      ? agentRoute.selectedProfileId
      : profiles[0]?.id ?? null;

    if (selectedProfileId !== agentRoute.selectedProfileId) {
      setAgentRoute({ page: "profiles", selectedProfileId });
    }
  }, [agentRoute, configuration]);

  useEffect(() => {
    if (apiAccessActive) {
      void apiAccessSession.load();
    }
  }, [apiAccessActive, apiAccessSession.load]);

  useEffect(() => {
    if (auditActive) {
      void operationsSession.load();
    }
  }, [auditActive, operationsSession.load]);

  useLayoutEffect(() => {
    if (!active) {
      apiAccessSession.reset();
      operationsSession.reset();
      systemOwnerCredentialSession.dismissSecret();
    }
  }, [
    active,
    apiAccessSession.reset,
    operationsSession.reset,
    systemOwnerCredentialSession.dismissSecret,
  ]);

  useEffect(() => {
    if (!apiAccessActive) return;
    const { tokens, trustedClientTokens } = apiAccessSession.snapshot;
    const selectionExists = apiAccessSelection.kind === "automation"
      ? tokens.some(({ id }) => id === apiAccessSelection.id)
      : apiAccessSelection.kind === "trusted"
        ? trustedClientTokens.some(({ id }) => id === apiAccessSelection.id)
        : false;

    if (selectionExists) return;
    if (tokens[0]) {
      setApiAccessSelection({ id: tokens[0].id, kind: "automation" });
    } else if (trustedClientTokens[0]) {
      setApiAccessSelection({ id: trustedClientTokens[0].id, kind: "trusted" });
    } else if (apiAccessSelection.kind !== "overview") {
      setApiAccessSelection({ kind: "overview" });
    }
  }, [
    apiAccessActive,
    apiAccessSelection,
    apiAccessSession.snapshot.tokens,
    apiAccessSession.snapshot.trustedClientTokens,
  ]);

  const changeSection = (nextSection: SettingsSection) => {
    if (section === "api-access" && nextSection !== "api-access") {
      apiAccessSession.reset();
    }
    if (section === "audit" && nextSection !== "audit") {
      operationsSession.reset();
    }
    if (section === "system" && nextSection !== "system") {
      systemOwnerCredentialSession.dismissSecret();
    }
    setSection(nextSection);
  };

  return active
    ? renderActivity(({
        contextWidth,
        onCollapseDetail,
        onContextWidthChange,
      }) =>
        createSettingsActivitySlots({
          agent: application.agent,
          agentRoute,
          apiAccessSession,
          apiAccessSelection,
          onAgentRouteChange: setAgentRoute,
          onApiAccessSelectionChange: setApiAccessSelection,
          onCollapseDetail,
          onSectionChange: changeSection,
          operationsSession: {
            load: operationsSession.load,
            selectEntry: operationsSession.selectEntry,
            snapshot: operationsSession.snapshot,
          },
          section,
          system: application.system,
          systemOwnerCredentialSession: {
            activatePreparedOwnerCredential:
              systemOwnerCredentialSession.activatePreparedOwnerCredential,
            clearOwnerCredential:
              systemOwnerCredentialSession.clearOwnerCredential,
            dismissSecret: systemOwnerCredentialSession.dismissSecret,
            prepareOwnerCredentialRotation:
              systemOwnerCredentialSession.prepareOwnerCredentialRotation,
            snapshot: systemOwnerCredentialSession.snapshot,
          },
          workbench: { contextWidth, onContextWidthChange },
        }),
      )
    : null;
}

export type SettingsActivityApplication = { agent: AgentApplication; apiAccess: ApiAccessApplication; operations: OperationApplication; system: SystemApplication; };
export type SettingsActivityControllerProps = ActivityControllerProps<SettingsActivityApplication>;
