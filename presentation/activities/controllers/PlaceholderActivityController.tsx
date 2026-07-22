import { createPlaceholderActivitySlots } from "../views/PlaceholderActivitySlots";
import type { RenderWorkspaceActivity } from "./activityController";

export function PlaceholderActivityController({
  activityId,
  renderActivity,
}: {
  activityId: "data" | "search";
  renderActivity: RenderWorkspaceActivity;
}) {
  return renderActivity(() => createPlaceholderActivitySlots(activityId));
}
