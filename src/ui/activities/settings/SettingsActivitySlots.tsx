import type { SettingsViewModel } from "../../../application/workspace/activities/settings/settingsViewModel";
import type { WorkspaceRepositoryIssueFocusRequest } from "../../../application/workspace/navigation/useWorkspaceNavigation";
import "../../styles/activities/settings.css";
import type { ActivitySlots } from "../../activityTypes";
import {
  SettingsPanel,
  SettingsRepositoryContext,
  type SettingsWorkbenchPreferences,
} from "./SettingsPanel";

export function createSettingsActivitySlots({
  onConsumeRepositoryIssueFocusRequest,
  repositoryIssueFocusRequest,
  view,
  workbench,
}: {
  onConsumeRepositoryIssueFocusRequest: (requestId: number) => void;
  repositoryIssueFocusRequest: WorkspaceRepositoryIssueFocusRequest | null;
  view: SettingsViewModel;
  workbench: SettingsWorkbenchPreferences;
}): ActivitySlots {
  return {
    context: {
      content: (
        <SettingsRepositoryContext
          focusRequest={repositoryIssueFocusRequest}
          onConsumeFocusRequest={onConsumeRepositoryIssueFocusRequest}
          view={view}
        />
      ),
      title: "仓库",
    },
    detail: null,
    main: <SettingsPanel view={view} workbench={workbench} />,
  };
}
