// SPDX-License-Identifier: GPL-3.0-or-later

import {
  Archive,
  Braces,
  CalendarDays,
  FileText,
  ListChecks,
  Search,
  Settings,
  type LucideIcon,
} from "lucide-react";
import {
  lazy,
  type ComponentType,
  type LazyExoticComponent,
} from "react";
import type { ActivityId } from "../ui/activityTypes";
import type { ActivityControllerProps } from "./activityController";

export type ActivityDescriptor = {
  availability: "always" | "workspace";
  Controller: LazyExoticComponent<ComponentType<ActivityControllerProps>>;
  group: "management" | "primary";
  icon: LucideIcon;
  id: ActivityId;
  label: string;
};

export const activityDescriptors: readonly ActivityDescriptor[] = [
  {
    availability: "workspace",
    Controller: lazy(async () => ({
      default: (await import("./notes/NotesActivityController"))
        .NotesActivityController,
    })),
    group: "primary",
    icon: FileText,
    id: "notes",
    label: "笔记",
  },
  {
    availability: "always",
    Controller: lazy(async () => ({
      default: (await import("./journal/JournalActivityController"))
        .JournalActivityController,
    })),
    group: "primary",
    icon: CalendarDays,
    id: "journal",
    label: "日记",
  },
  {
    availability: "always",
    Controller: lazy(async () => ({
      default: (await import("./todo/TodoActivityController"))
        .TodoActivityController,
    })),
    group: "primary",
    icon: ListChecks,
    id: "todo",
    label: "代办",
  },
  {
    availability: "always",
    Controller: lazy(async () => ({
      default: (await import("./syntax/SyntaxActivityController"))
        .SyntaxActivityController,
    })),
    group: "primary",
    icon: Braces,
    id: "syntax",
    label: "语法",
  },
  {
    availability: "always",
    Controller: lazy(async () => ({
      default: (await import("./search/SearchActivityController"))
        .SearchActivityController,
    })),
    group: "primary",
    icon: Search,
    id: "search",
    label: "搜索",
  },
  {
    availability: "always",
    Controller: lazy(async () => ({
      default: (await import("./repository/RepositoryActivityController"))
        .RepositoryActivityController,
    })),
    group: "management",
    icon: Archive,
    id: "repository",
    label: "仓库",
  },
  {
    availability: "always",
    Controller: lazy(async () => ({
      default: (await import("./settings/SettingsActivityController"))
        .SettingsActivityController,
    })),
    group: "management",
    icon: Settings,
    id: "settings",
    label: "设置",
  },
];

export function listActivityDescriptors(
  group: ActivityDescriptor["group"],
) {
  return activityDescriptors.filter((descriptor) =>
    descriptor.group === group
  );
}

export function isActivityId(value: string): value is ActivityId {
  return activityDescriptors.some(({ id }) => id === value);
}

export function getActivityLabel(activityId: ActivityId) {
  return activityDescriptors.find(({ id }) => id === activityId)?.label ??
    activityId;
}
