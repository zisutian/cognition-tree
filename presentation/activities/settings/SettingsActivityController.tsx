import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import type {
  OwnerCredentialRotationActivation,
} from "../../../application/system";
import { createSettingsActivitySlots } from "./SettingsActivitySlots";
import type {
  AgentSettingsRoute,
  ApiAccessSelection,
  SettingsSection,
} from "./settingsTypes";
import type { ActivityControllerProps } from "../activityController";
import {
  useApiAccessSettingsSession,
} from "./useApiAccessSettingsSession";
import {
  useSystemOwnerCredentialSession,
} from "./useSystemOwnerCredentialSession";
import {
  useOperationsSettingsSession,
} from "./useOperationsSettingsSession";

export function SettingsActivityController({
  active,
  application,
  renderActivity,
}: ActivityControllerProps) {
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
