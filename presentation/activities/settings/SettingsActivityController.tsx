import { useEffect, useState } from "react";
import { createSettingsActivitySlots } from "./SettingsActivitySlots";
import type { SettingsSection } from "./settingsTypes";
import type { AgentSettingsPage } from "./AgentSettingsPanel";
import type {
  AgentSettingsSelection,
  ApiAccessSelection,
  ApiAccessStatusSnapshot,
  OperationsStatusSnapshot,
} from "./settingsTypes";
import type { ActivityControllerProps } from "../activityController";

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
  const [apiAccessSnapshot, setApiAccessSnapshot] = useState<ApiAccessStatusSnapshot>({
    dismissSecret: () => undefined,
    errorMessage: null,
    loading: true,
    secret: null,
    tokens: [],
    trustedClientTokens: [],
  });
  const [operationsSelectedEntryId, setOperationsSelectedEntryId] = useState<string | null>(null);
  const [operationsSnapshot, setOperationsSnapshot] = useState<OperationsStatusSnapshot>({
    entries: [],
    errorMessage: null,
    loading: true,
    status: null,
  });
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
          apiAccess: application.apiAccess,
          apiAccessSelection,
          apiAccessSnapshot,
          onAgentPageChange: setAgentPage,
          onAgentSelectionChange: setAgentSelection,
          onApiAccessSelectionChange: setApiAccessSelection,
          onApiAccessSnapshotChange: setApiAccessSnapshot,
          onCollapseDetail,
          onOperationsSelectedEntryIdChange: setOperationsSelectedEntryId,
          onOperationsSnapshotChange: setOperationsSnapshot,
          onSectionChange: setSection,
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
