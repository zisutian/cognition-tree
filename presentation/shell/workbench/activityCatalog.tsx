// SPDX-License-Identifier: GPL-3.0-or-later

import {
  Archive,
  Bot,
  Braces,
  CalendarDays,
  FileText,
  ListChecks,
  Search,
  Settings,
} from "lucide-react";
import {
  lazy,
  type ComponentType,
  type LazyExoticComponent,
} from "react";
import type {
  ActivityId,
  ActivityControllerProps,
  ActivityNavigationItem,
} from "../../ui/index.ts";

import type { WorkbenchApplication } from "../application/workbenchApplication.ts";
import type { SyntaxActivityControllerProps } from "../../activities/syntax/index.ts";


export type WorkbenchActivityControllerProps = ActivityControllerProps<WorkbenchApplication> & Omit<SyntaxActivityControllerProps, keyof ActivityControllerProps<unknown>>;



export type ActivityDescriptor = ActivityNavigationItem & {
  Controller: LazyExoticComponent<ComponentType<WorkbenchActivityControllerProps>>;
};

export const activityDescriptors: readonly ActivityDescriptor[] = [
  {
    Controller: lazy(async () => {
      const { NotesActivityController } = await import("../../activities/notes/index.ts");
      return { default: (props: WorkbenchActivityControllerProps) => {
        const { application } = props;
        return <NotesActivityController active={props.active} application={{ repository: { activeDescriptor: application.repository.activeDescriptor, session: application.repository.session }, workspace: application.workspace }} onActiveActivityChange={props.onActiveActivityChange} renderActivity={props.renderActivity} />;
      } };
    }),
    group: "primary",
    icon: FileText,
    id: "notes",
    label: "笔记",
  },
  {
    Controller: lazy(async () => {
      const { JournalActivityController } = await import("../../activities/journal/index.ts");
      return { default: (props: WorkbenchActivityControllerProps) => {
        const { application } = props;
        return <JournalActivityController active={props.active} application={{ journal: application.journal, repository: { builtIns: application.repository.builtIns } }} onActiveActivityChange={props.onActiveActivityChange} renderActivity={props.renderActivity} />;
      } };
    }),
    group: "primary",
    icon: CalendarDays,
    id: "journal",
    label: "日记",
  },
  {
    Controller: lazy(async () => {
      const { TodoActivityController } = await import("../../activities/todo/index.ts");
      return { default: (props: WorkbenchActivityControllerProps) => {
        const { application } = props;
        return <TodoActivityController active={props.active} application={{ todo: application.todo, repository: { builtIns: application.repository.builtIns } }} onActiveActivityChange={props.onActiveActivityChange} renderActivity={props.renderActivity} />;
      } };
    }),
    group: "primary",
    icon: ListChecks,
    id: "todo",
    label: "代办",
  },
  {
    Controller: lazy(async () => {
      const { SyntaxActivityController } = await import("../../activities/syntax/index.ts");
      return { default: (props: WorkbenchActivityControllerProps) => {
        const { application } = props;
        return <SyntaxActivityController active={props.active} application={{ journal: application.journal.status === "ready" ? { status: "ready", view: { syntax: application.journal.view.syntax, diagnostics: application.journal.view.diagnostics } } : { status: application.journal.status }, todo: application.todo.status === "ready" ? { status: "ready", view: { syntax: application.todo.view.syntax, diagnostics: application.todo.view.diagnostics } } : { status: application.todo.status }, workspace: application.workspace }} onActiveActivityChange={props.onActiveActivityChange} renderActivity={props.renderActivity} onSyntaxLeaveBlockedChange={props.onSyntaxLeaveBlockedChange} onSyntaxProblemsChange={props.onSyntaxProblemsChange} systemSyntaxFocusRequest={props.systemSyntaxFocusRequest} onConsumeSystemSyntaxFocusRequest={props.onConsumeSystemSyntaxFocusRequest} />;
      } };
    }),
    group: "primary",
    icon: Braces,
    id: "syntax",
    label: "语法",
  },
  {
    Controller: lazy(async () => {
      const { AgentActivityController } = await import("../../activities/agent/index.ts");
      return { default: (props: WorkbenchActivityControllerProps) => {
        const { application } = props;
        return <AgentActivityController active={props.active} application={{ agent: application.agent }} onActiveActivityChange={props.onActiveActivityChange} renderActivity={props.renderActivity} />;
      } };
    }),
    group: "management",
    icon: Bot,
    id: "agent",
    label: "智能体",
  },
  {
    Controller: lazy(async () => {
      const { SearchActivityController } = await import("../../activities/search/index.ts");
      return { default: (props: WorkbenchActivityControllerProps) => {
        const { application } = props;
        return <SearchActivityController active={props.active} application={{ repository: { catalogState: application.repository.catalogState }, search: application.search }} onActiveActivityChange={props.onActiveActivityChange} renderActivity={props.renderActivity} />;
      } };
    }),
    group: "management",
    icon: Search,
    id: "search",
    label: "搜索",
  },
  {
    Controller: lazy(async () => {
      const { RepositoryActivityController } = await import("../../activities/repository/index.ts");
      return { default: (props: WorkbenchActivityControllerProps) => {
        const { application } = props;
        return <RepositoryActivityController active={props.active} application={{ repository: application.repository }} onActiveActivityChange={props.onActiveActivityChange} renderActivity={props.renderActivity} />;
      } };
    }),
    group: "management",
    icon: Archive,
    id: "repository",
    label: "仓库",
  },
  {
    Controller: lazy(async () => {
      const { SettingsActivityController } = await import("../../activities/settings/index.ts");
      return { default: (props: WorkbenchActivityControllerProps) => {
        const { application } = props;
        return <SettingsActivityController active={props.active} application={{ agent: application.agent, apiAccess: application.apiAccess, operations: application.operations, system: application.system }} onActiveActivityChange={props.onActiveActivityChange} renderActivity={props.renderActivity} />;
      } };
    }),
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
