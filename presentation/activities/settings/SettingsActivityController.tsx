import { useEffect, useLayoutEffect, useState } from "react";
import { createSettingsActivitySlots } from "./SettingsActivitySlots";
import type { SettingsSection } from "./settingsTypes";
import type { AgentSettingsPage } from "./AgentSettingsPanel";
import type {
  AgentSettingsSelection,
  ApiAccessSelection,
  OperationsStatusSnapshot,
} from "./settingsTypes";
import type { ActivityControllerProps } from "../activityController";
import {
  useApiAccessSettingsSession,
} from "./useApiAccessSettingsSession";

export function SettingsActivityController({
  active,
  application,
  renderActivity,
}: ActivityControllerProps) {
  const [section, setSection] = useState<SettingsSection>("interface");
  const [agentPage, setAgentPage] = useState<AgentSettingsPage>("overview");
  const [agentSelection, setAgentSelection] = useState<AgentSettingsSelection>({
    kind: "overview",
  });
  const [apiAccessSelection, setApiAccessSelection] = useState<ApiAccessSelection>({
    kind: "overview",
  });
  const [operationsSelectedEntryId, setOperationsSelectedEntryId] = useState<string | null>(null);
  const [operationsSnapshot, setOperationsSnapshot] = useState<OperationsStatusSnapshot>({
    entries: [],
    errorMessage: null,
    loading: true,
    status: null,
  });
  const apiAccessSession = useApiAccessSettingsSession(application.apiAccess);
  const apiAccessActive = active && section === "api-access";
  const configuration = application.agent.configurationState.configuration;
  const providers = configuration?.providers ?? [];
  const profiles = configuration?.profiles ?? [];

  useEffect(() => {
    if (agentPage === "overview") {
      if (agentSelection.kind !== "overview") {
        setAgentSelection({ kind: "overview" });
      }
      return;
    }
    if (agentPage === "providers") {
      const currentExists = agentSelection.kind === "provider" && providers.some(
        ({ id }) => id === agentSelection.id,
      );

      if (!currentExists) {
        setAgentSelection(providers[0]
          ? { id: providers[0].id, kind: "provider" }
          : { kind: "overview" });
      }
      return;
    }
    const currentExists = agentSelection.kind === "profile" && profiles.some(
      ({ id }) => id === agentSelection.id,
    );

    if (!currentExists) {
      setAgentSelection(profiles[0]
        ? { id: profiles[0].id, kind: "profile" }
        : { kind: "overview" });
    }
  }, [agentPage, agentSelection, configuration]);

  useEffect(() => {
    if (apiAccessActive) {
      void apiAccessSession.load();
    }
  }, [apiAccessActive, apiAccessSession.load]);

  useLayoutEffect(() => {
    if (!active) {
      apiAccessSession.reset();
    }
  }, [active, apiAccessSession.reset]);

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
          agentPage,
          agentSelection,
          apiAccessSession,
          apiAccessSelection,
          onAgentPageChange: setAgentPage,
          onAgentSelectionChange: setAgentSelection,
          onApiAccessSelectionChange: setApiAccessSelection,
          onCollapseDetail,
          onOperationsSelectedEntryIdChange: setOperationsSelectedEntryId,
          onOperationsSnapshotChange: setOperationsSnapshot,
          onSectionChange: changeSection,
          operations: application.operations,
          operationsSelectedEntryId,
          operationsSnapshot,
          section,
          system: application.system,
          workbench: { contextWidth, onContextWidthChange },
        }),
      )
    : null;
}
