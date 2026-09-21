// SPDX-License-Identifier: GPL-3.0-or-later
import type { OpenIntent } from "compact-ui";
import { PageViewSessions } from "./pageViewSessions.ts";

export type ActivityId =
  | "agent"
  | "notes"
  | "journal"
  | "todo"
  | "syntax"
  | "search"
  | "repository"
  | "settings";
export type ActivityInteractionState = Readonly<{
  navigationBlocked: boolean;
  statusMessage: string;
}>;
export type PageTarget = Readonly<{
  activityId: ActivityId;
  kind:
    | "activity"
    | "note"
    | "structure"
    | "graph"
    | "journal-entry"
    | "todo-collection"
    | "agent-session"
    | "agent-create"
    | "syntax"
    | "settings"
    | "repository";
  id: string;
  repositoryId: string | null;
}>;
export type PageSession = Readonly<{
  key: string;
  target: PageTarget;
  title: string;
}>;
export type PageDescriptor = Omit<PageSession, "key">;
export type PageDriver = {
  ready?: boolean;
  current(): PageDescriptor | null;
  /** undefined means temporarily unavailable; null confirms deletion. */
  describe(target: PageTarget): PageDescriptor | null | undefined;
  select(target: PageTarget): void | boolean | Promise<void | boolean>;
};
export const pageKey = (target: PageTarget) =>
  JSON.stringify([
    target.activityId,
    target.repositoryId,
    target.kind,
    target.id,
  ]);
const idle: ActivityInteractionState = {
  navigationBlocked: false,
  statusMessage: "",
};
const labels: Record<ActivityId, string> = {
  notes: "笔记",
  journal: "日记",
  todo: "代办",
  agent: "智能体",
  syntax: "语法",
  search: "搜索",
  repository: "仓库",
  settings: "设置",
};
const landing = (
  activityId: ActivityId,
  repositoryId: string | null,
): PageDescriptor =>
  describePage(
    activityId,
    "activity",
    activityId,
    labels[activityId],
    activityId === "notes" ? repositoryId : null,
  );

/** Owns navigation only. Authoritative content stays in application controllers. */
export function createPageNavigation(initial: ActivityId) {
  const viewSessions = new PageViewSessions();
  const listeners = new Set<() => void>();
  const interactions = new Map<ActivityId, ActivityInteractionState>();
  const drivers = new Map<ActivityId, PageDriver>();
  const observedTargets = new Map<ActivityId, string | null>();
  let repositoryId: string | null = null;
  let epoch = 0;
  let disposed = false;
  let restore: string | null = null;
  let switchingRepository: { id: string; request: number } | null = null;
  let following: {
    activity: ActivityId;
    intent: OpenIntent;
    after?: string;
  } | null = { activity: initial, intent: "preview" };
  let reportError: (error: unknown) => void = () => undefined;
  let canRelease: (target: PageTarget) => boolean = () => true;
  let beforeClose: (target: PageTarget) => void | Promise<void> = () =>
    undefined;
  const first = {
    ...landing(initial, null),
    key: pageKey(landing(initial, null).target),
  };
  let state = {
    activeActivityId: initial,
    activePageId: first.key as string | null,
    pages: [first] as readonly PageSession[],
    previewId: first.key as string | null,
    interaction: idle,
    pending: false,
  };
  const visible = (page: PageSession) =>
    page.target.repositoryId === null ||
    page.target.repositoryId === repositoryId;
  const publish = (patch: Partial<typeof state>) => {
    if (disposed) return;
    state = { ...state, ...patch };
    viewSessions.retain(new Set(state.pages.map((page) => page.key)));
    state = {
      ...state,
      interaction: interactions.get(state.activeActivityId) ?? idle,
    };
    listeners.forEach((fn) => fn());
  };
  const allowed = (target: PageTarget) =>
    !state.interaction.navigationBlocked ||
    state.activePageId === pageKey(target);
  const commit = (page: PageDescriptor, intent: OpenIntent) => {
    const key = pageKey(page.target);
    let pages = [...state.pages];
    let previewId = state.previewId;
    if (pages.some((p) => p.key === key)) {
      pages = pages.map((p) => (p.key === key ? { ...page, key } : p));
      if (intent === "pinned" && previewId === key) previewId = null;
    } else {
      const replace = pages.findIndex(
        (p) => p.key === previewId && canRelease(p.target),
      );
      if (replace >= 0) pages.splice(replace, 1, { ...page, key });
      else pages.push({ ...page, key });
      previewId = intent === "preview" ? key : null;
    }
    publish({
      pages,
      previewId,
      activePageId: key,
      activeActivityId: page.target.activityId,
      pending: false,
    });
  };
  const fail = (request: number, error: unknown) => {
    if (!disposed && request === epoch) {
      publish({ pending: false });
      reportError(error);
    }
  };
  const select = (page: PageDescriptor) => {
    const driver = drivers.get(page.target.activityId);
    if (!driver || driver.ready === false) return false;
    return driver.select(page.target);
  };
  const open = (
    page: PageDescriptor,
    intent: OpenIntent = "preview",
    action?: () => void | boolean | Promise<void | boolean>,
  ) => {
    if (disposed || !allowed(page.target)) return false;
    if (
      page.target.repositoryId !== null &&
      page.target.repositoryId !== repositoryId
    )
      return false;
    const request = ++epoch;
    following = null;
    restore = null;
    try {
      const result = action ? action() : select(page);
      if (result instanceof Promise) {
        publish({ pending: true });
        void result.then(
          (ok) => {
            if (!disposed && request === epoch) {
              if (ok !== false) commit(page, intent);
              else publish({ pending: false });
            }
          },
          (error) => fail(request, error),
        );
        return true;
      }
      if (result === false) return false;
      commit(page, intent);
      return true;
    } catch (error) {
      fail(request, error);
      return false;
    }
  };
  const restoreSelection = () => {
    const page = state.pages.find((p) => p.key === restore && visible(p));
    if (!page) {
      restore = null;
      return false;
    }
    const driver = drivers.get(page.target.activityId);
    if (!driver || driver.ready === false) return false;
    const described = driver.describe(page.target);
    if (!described || pageKey(described.target) !== page.key) return false;
    restore = null;
    return open(page, page.key === state.previewId ? "preview" : "pinned");
  };
  const api = {
    viewSessions,
    getSnapshot: () => state,
    getRepositoryId: () => repositoryId,
    subscribe(fn: () => void) {
      if (disposed) return () => {};
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    setGuards(guards: {
      canRelease(target: PageTarget): boolean;
      beforeClose(target: PageTarget): void | Promise<void>;
      reportError(error: unknown): void;
    }) {
      canRelease = guards.canRelease;
      beforeClose = guards.beforeClose;
      reportError = guards.reportError;
    },
    visiblePages: () => state.pages.filter(visible),
    reportInteraction(activity: ActivityId, value: ActivityInteractionState) {
      const current = interactions.get(activity) ?? idle;
      if (
        current.navigationBlocked === value.navigationBlocked &&
        current.statusMessage === value.statusMessage
      )
        return;
      interactions.set(activity, value);
      if (state.activeActivityId === activity) publish({});
    },
    open,
    request(
      activity: ActivityId,
      beforeChange?: () => boolean | void,
      intent: OpenIntent = "preview",
    ) {
      if (
        disposed ||
        (state.interaction.navigationBlocked &&
          activity !== state.activeActivityId)
      )
        return false;
      try {
        if (beforeChange?.() === false) return false;
      } catch (error) {
        reportError(error);
        return false;
      }
      ++epoch;
      restore = null;
      following = { activity, intent };
      const current = drivers.get(activity)?.current();
      commit(current ?? landing(activity, repositoryId), intent);
      return true;
    },
    created<T>(activity: ActivityId, action: () => T) {
      const before = drivers.get(activity)?.current();
      const request = epoch;
      const value = action();
      const follow = () => {
        if (disposed || request !== epoch) return;
        following = {
          activity,
          intent: "pinned",
          after: before ? pageKey(before.target) : undefined,
        };
        api.reconcile(activity);
      };
      if (value instanceof Promise) void value.then(follow, reportError);
      else follow();
      return value;
    },
    activate(key: string) {
      const page = state.pages.find((p) => p.key === key && visible(p));
      return page
        ? open(page, state.previewId === key ? "preview" : "pinned")
        : false;
    },
    close(key: string) {
      if (disposed || state.pending || state.interaction.navigationBlocked)
        return false;
      const page = state.pages.find((p) => p.key === key);
      if (!page) return false;
      const request = ++epoch;
      following = null;
      restore = null;
      const finish = () => {
        if (disposed || request !== epoch) return;
        const shown = state.pages.filter(visible),
          i = shown.findIndex((p) => p.key === key);
        const next =
          state.activePageId === key
            ? (shown[i + 1] ?? shown[i - 1])
            : undefined;
        const remove = () => {
          if (disposed || request !== epoch) return;
          publish({
            pages: state.pages.filter((p) => p.key !== key),
            previewId: state.previewId === key ? null : state.previewId,
            activePageId:
              state.activePageId === key
                ? (next?.key ?? null)
                : state.activePageId,
            activeActivityId: next?.target.activityId ?? state.activeActivityId,
            pending: false,
          });
        };
        try {
          const result = next ? select(next) : undefined;
          if (result instanceof Promise) {
            publish({ pending: true });
            void result.then(
              (ok) => {
                if (ok !== false) remove();
                else if (request === epoch) publish({ pending: false });
              },
              (error) => fail(request, error),
            );
          } else if (result !== false) remove();
          else publish({ pending: false });
        } catch (error) {
          fail(request, error);
        }
      };
      try {
        const result = beforeClose(page.target);
        if (result instanceof Promise) {
          publish({ pending: true });
          void result.then(finish, (error) => fail(request, error));
        } else finish();
        return true;
      } catch (error) {
        fail(request, error);
        return false;
      }
    },
    register(activity: ActivityId, driver: PageDriver) {
      drivers.set(activity, driver);
      return () => {
        if (drivers.get(activity) === driver) drivers.delete(activity);
      };
    },
    reconcile(activity: ActivityId) {
      const driver = drivers.get(activity);
      if (!driver || driver.ready === false || disposed) return;
      const currentTarget = driver.current();
      const currentKey = currentTarget ? pageKey(currentTarget.target) : null;
      const previousKey = observedTargets.get(activity);
      observedTargets.set(activity, currentKey);
      if (restore && state.activeActivityId === activity && restoreSelection())
        return;
      if (
        following?.activity === activity &&
        state.activeActivityId === activity
      ) {
        const current = driver.current();
        if (
          current &&
          (current.target.repositoryId === null ||
            current.target.repositoryId === repositoryId) &&
          (!following.after || pageKey(current.target) !== following.after)
        ) {
          const intent = following.intent;
          following = null;
          commit(current, intent);
        }
      }
      // External focus requests and domain commands change selection through their existing facade.
      // Only a newly observed target may follow; stale renders cannot undo an explicit navigation.
      if (
        !following &&
        !restore &&
        !state.pending &&
        currentTarget &&
        previousKey !== undefined &&
        currentKey !== previousKey &&
        state.activeActivityId === activity &&
        state.activePageId !== currentKey &&
        (currentTarget.target.repositoryId === null ||
          currentTarget.target.repositoryId === repositoryId)
      ) {
        commit(currentTarget, "preview");
      }
      let changed = false;
      const pages = state.pages.flatMap((page) => {
        if (
          page.target.activityId !== activity ||
          !visible(page) ||
          page.target.kind === "activity"
        )
          return [page];
        const value = driver.describe(page.target);
        if (
          value === undefined ||
          (value && pageKey(value.target) !== page.key)
        )
          return [page];
        if (value === null) {
          changed = true;
          return [];
        }
        if (value.title !== page.title) {
          changed = true;
          return [{ ...page, title: value.title }];
        }
        return [page];
      });
      if (changed) {
        const current = pages.find((p) => p.key === state.activePageId);
        const next = current ?? pages.filter(visible).at(-1);
        if (!current) restore = next?.key ?? null;
        publish({
          pages,
          previewId: pages.some((p) => p.key === state.previewId)
            ? state.previewId
            : null,
          activePageId: next?.key ?? null,
          activeActivityId: next?.target.activityId ?? state.activeActivityId,
        });
        restoreSelection();
      }
    },
    async switchRepository(id: string, action: () => Promise<void>) {
      if (disposed || state.interaction.navigationBlocked) return false;
      const request = ++epoch;
      switchingRepository = { id, request };
      following = null;
      restore = null;
      publish({ pending: true });
      try {
        await action();
        if (disposed || request !== epoch) return false;
        api.setRepository(id);
        const retained = state.pages
          .filter(
            (p) =>
              p.target.activityId === "notes" && p.target.repositoryId === id,
          )
          .at(-1);
        const current = drivers.get("notes")?.current();
        const page =
          retained ??
          (current?.target.repositoryId === id
            ? current
            : landing("notes", id));
        following = retained ? null : { activity: "notes", intent: "preview" };
        commit(page, retained ? "pinned" : "preview");
        if (retained) {
          restore = retained.key;
          restoreSelection();
        }
        return true;
      } catch (error) {
        fail(request, error);
        return false;
      } finally {
        if (switchingRepository?.request === request)
          switchingRepository = null;
      }
    },
    setRepository(id: string | null) {
      if (id === repositoryId) return;
      if (switchingRepository?.id !== id) ++epoch;
      repositoryId = id;
      const wasLanding =
        state.pages.find((p) => p.key === state.activePageId)?.target.kind ===
        "activity";
      following = wasLanding
        ? { activity: state.activeActivityId, intent: "preview" }
        : null;
      const pages = state.pages.filter(
        (page) => page.key !== state.previewId || visible(page),
      );
      const current = pages.find(
        (p) => p.key === state.activePageId && visible(p),
      );
      const next = current ?? pages.filter(visible).at(-1);
      restore = current ? null : (next?.key ?? null);
      publish({
        pages,
        previewId: pages.some((p) => p.key === state.previewId)
          ? state.previewId
          : null,
        activePageId: next?.key ?? null,
        activeActivityId: next?.target.activityId ?? state.activeActivityId,
        pending: false,
      });
    },
    retainRepositories(ids: ReadonlySet<string>) {
      const pages = state.pages.filter(
        (p) => p.target.repositoryId === null || ids.has(p.target.repositoryId),
      );
      if (pages.length !== state.pages.length)
        publish({
          pages,
          activePageId: pages.some((p) => p.key === state.activePageId)
            ? state.activePageId
            : null,
          previewId: pages.some((p) => p.key === state.previewId)
            ? state.previewId
            : null,
        });
    },
    dispose() {
      disposed = true;
      ++epoch;
      listeners.clear();
      viewSessions.clear();
      drivers.clear();
      observedTargets.clear();
      interactions.clear();
      state = { ...state, pages: [], activePageId: null, previewId: null };
    },
  };
  return api;
}
export type PageNavigation = ReturnType<typeof createPageNavigation>;
export function describePage(
  activityId: ActivityId,
  kind: PageTarget["kind"],
  id: string,
  title: string,
  repositoryId: string | null = null,
): PageDescriptor {
  return { target: { activityId, kind, id, repositoryId }, title };
}
