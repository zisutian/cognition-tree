import type { ActivitySlots } from "../activityTypes";
import "../styles/activities/placeholder.css";
import { PlaceholderPanel } from "./PlaceholderPanel";

export function createPlaceholderActivitySlots(
  activityId: "data" | "search",
): ActivitySlots {
  const label = activityId === "search" ? "搜索" : "数据";

  return {
    context: null,
    detail: null,
    main: (
      <PlaceholderPanel
        description={`${label}功能待接入。`}
        title={label}
      />
    ),
  };
}
