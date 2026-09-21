import { describe, expect, it, vi } from "vitest";
import {
  createPageNavigation,
  describePage,
  pageKey,
  type PageDescriptor,
} from "../../../../../presentation/navigation/index.ts";

function fixture() {
  const navigation = createPageNavigation("notes");
  navigation.setRepository("one");
  const pages = new Map<string, PageDescriptor>();
  let selected: PageDescriptor | null = null;
  let available = true;
  for (const activity of ["notes", "journal", "settings", "search"] as const)
    navigation.register(activity, {
      get ready() {
        return available;
      },
      current: () =>
        selected?.target.activityId === activity ? selected : null,
      describe: (target) => pages.get(pageKey(target)) ?? null,
      select: (target) => {
        const next = pages.get(pageKey(target));
        if (!next) return false;
        selected = next;
      },
    });
  const note = (id: string, repository = "one") =>
    describePage("notes", "note", id, `笔记 ${id}`, repository);
  const journal = (id: string) =>
    describePage("journal", "journal-entry", id, `日记 ${id}`);
  const add = (
    page: PageDescriptor,
    intent: "preview" | "pinned" = "preview",
  ) => {
    pages.set(pageKey(page.target), page);
    navigation.open(page, intent);
    return pageKey(page.target);
  };
  return {
    navigation,
    pages,
    note,
    journal,
    add,
    selected: () => selected,
    setAvailable: (value: boolean) => {
      available = value;
    },
    setSelected: (value: PageDescriptor) => {
      selected = value;
    },
  };
}

describe("page navigation sessions", () => {
  it("owns one preview slot across activities and never demotes a fixed tab", () => {
    const f = fixture();
    const a = f.add(f.note("a"));
    const b = f.add(f.note("b"));
    expect(f.navigation.getSnapshot().pages.map((p) => p.key)).toEqual([b]);
    f.navigation.open(f.note("b"), "pinned");
    f.add(f.journal("today"));
    f.add(f.note("c"));
    f.navigation.open(f.note("b"), "preview");
    expect(f.navigation.getSnapshot().pages.map((p) => p.key)).toEqual([
      b,
      pageKey(f.note("c").target),
    ]);
    expect(f.navigation.getSnapshot().previewId).not.toBe(b);
    expect(f.navigation.getSnapshot().pages.some((p) => p.key === a)).toBe(
      false,
    );
  });
  it("closes active tabs toward the next neighbor, then previous, then empty", () => {
    const f = fixture(),
      a = f.add(f.note("a"), "pinned"),
      b = f.add(f.note("b"), "pinned"),
      c = f.add(f.note("c"), "pinned");
    f.navigation.activate(b);
    f.navigation.close(b);
    expect(f.selected()?.target.id).toBe("c");
    f.navigation.close(c);
    expect(f.selected()?.target.id).toBe("a");
    f.navigation.close(a);
    expect(f.navigation.getSnapshot().activePageId).toBeNull();
    expect(f.navigation.getSnapshot().pages).toEqual([]);
  });
  it("updates titles and prunes only confirmed deleted resources", () => {
    const f = fixture(),
      a = f.add(f.note("a"), "pinned"),
      b = f.add(f.note("b"), "pinned");
    f.setAvailable(false);
    f.pages.delete(b);
    f.navigation.reconcile("notes");
    expect(f.navigation.getSnapshot().pages).toHaveLength(2);
    f.setAvailable(true);
    f.pages.set(a, { ...f.note("a"), title: "新标题" });
    f.navigation.reconcile("notes");
    expect(f.navigation.getSnapshot().pages.map((p) => p.title)).toEqual([
      "新标题",
    ]);
    expect(f.selected()?.target.id).toBe("a");
  });
  it("retains repository tabs independently and global pages across switching", () => {
    const f = fixture(),
      a = f.add(f.note("a"), "pinned"),
      j = f.add(f.journal("today"), "pinned");
    f.add(f.note("preview"));
    f.navigation.setRepository("two");
    expect(f.navigation.visiblePages().map((p) => p.key)).toEqual([j]);
    const b = f.add(f.note("b", "two"), "pinned");
    f.navigation.setRepository("one");
    f.navigation.reconcile("notes");
    expect(f.navigation.visiblePages().map((p) => p.key)).toEqual([a, j]);
    expect(f.navigation.getSnapshot().pages.some((p) => p.key === b)).toBe(
      true,
    );
    f.navigation.activate(a);
    expect(f.selected()?.target.id).toBe("a");
    f.navigation.retainRepositories(new Set(["one"]));
    expect(f.navigation.getSnapshot().pages.some((p) => p.key === b)).toBe(
      false,
    );
  });
  it("does not follow the stale selection from the render that restores a repository page", async () => {
    const f = fixture();
    const retained = f.add(f.note("retained"), "pinned");
    f.navigation.reconcile("notes");
    f.navigation.setRepository("two");
    f.add(f.note("other", "two"), "pinned");
    f.navigation.reconcile("notes");
    f.setAvailable(false);
    await f.navigation.switchRepository("one", async () => {});
    f.setSelected(f.note("default"));
    f.pages.set(pageKey(f.note("default").target), f.note("default"));
    f.setAvailable(true);
    f.navigation.reconcile("notes");
    expect(f.navigation.getSnapshot().activePageId).toBe(retained);
    expect(f.selected()?.target.id).toBe("retained");
  });
  it("does not mutate target selection when settings or syntax rejects leaving", () => {
    const f = fixture(),
      s = describePage("settings", "settings", "system", "系统设置");
    f.add(s, "pinned");
    f.navigation.reportInteraction("settings", {
      navigationBlocked: true,
      statusMessage: "未保存",
    });
    const action = vi.fn();
    expect(f.navigation.open(f.note("a"), "preview", action)).toBe(false);
    expect(f.navigation.close(pageKey(s.target))).toBe(false);
    expect(action).not.toHaveBeenCalled();
    expect(f.navigation.request("journal", action)).toBe(false);
    expect(action).not.toHaveBeenCalled();
  });
  it("keeps an unresolved preview fixed so recovery remains reachable", () => {
    const f = fixture(),
      a = f.add(f.note("a"));
    const error = vi.fn();
    f.navigation.setGuards({
      canRelease: (target) => target.id !== "a",
      beforeClose: () => {
        throw new Error("conflict");
      },
      reportError: error,
    });
    const b = f.add(f.note("b"));
    expect(f.navigation.getSnapshot().pages.map((p) => p.key)).toEqual([a, b]);
    expect(f.navigation.getSnapshot().previewId).toBe(b);
    expect(f.navigation.close(a)).toBe(false);
    expect(error).toHaveBeenCalled();
    expect(f.navigation.getSnapshot().pages.some((p) => p.key === a)).toBe(
      true,
    );
  });
  it("waits for save on close and retains the tab on a failed save", async () => {
    const f = fixture(),
      a = f.add(f.note("a"));
    let reject!: (error: Error) => void;
    const save = new Promise<void>((_, fail) => {
      reject = fail;
    });
    const error = vi.fn();
    f.navigation.setGuards({
      canRelease: () => false,
      beforeClose: () => save,
      reportError: error,
    });
    f.navigation.close(a);
    expect(f.navigation.getSnapshot().pending).toBe(true);
    reject(new Error("offline"));
    await save.catch(() => {});
    await Promise.resolve();
    expect(f.navigation.getSnapshot().activePageId).toBe(a);
    expect(f.navigation.getSnapshot().pending).toBe(false);
    expect(error).toHaveBeenCalledOnce();
  });
  it("ignores a delayed selection after newer navigation", async () => {
    const f = fixture();
    let resolve!: (value: boolean) => void;
    const pending = new Promise<boolean>((done) => {
      resolve = done;
    });
    f.navigation.open(f.note("old"), "preview", () => pending);
    const current = f.add(f.note("new"));
    resolve(true);
    await pending;
    expect(f.navigation.getSnapshot().activePageId).toBe(current);
    expect(
      f.navigation.getSnapshot().pages.some((p) => p.target.id === "old"),
    ).toBe(false);
  });
  it("does not let a delayed close remove newer navigation", async () => {
    const f = fixture(),
      a = f.add(f.note("a"), "pinned");
    let resolve!: () => void;
    const pending = new Promise<void>((done) => {
      resolve = done;
    });
    f.navigation.setGuards({
      canRelease: () => true,
      beforeClose: () => pending,
      reportError: () => {},
    });
    f.navigation.close(a);
    const b = f.add(f.note("b"));
    resolve();
    await pending;
    expect(f.navigation.getSnapshot().activePageId).toBe(b);
    expect(f.navigation.getSnapshot().pages.some((p) => p.key === a)).toBe(
      true,
    );
  });
  it("pins new resources only after successful creation selects the new target", () => {
    const f = fixture();
    f.add(f.note("old"));
    const added = f.note("new");
    f.pages.set(pageKey(added.target), added);
    f.navigation.created("notes", () => {
      f.navigation.register("notes", {
        current: () => added,
        describe: (t) => f.pages.get(pageKey(t)) ?? null,
        select: () => {},
      });
    });
    expect(f.navigation.getSnapshot().activePageId).toBe(pageKey(added.target));
    expect(f.navigation.getSnapshot().previewId).toBeNull();
  });
  it("prunes view state on close and destroys all login-session state on logout", () => {
    const f = fixture(),
      a = f.add(f.note("a"), "pinned"),
      b = f.add(f.note("b"), "pinned");
    f.navigation.viewSessions.write(a, { cursor: 3 });
    f.navigation.viewSessions.write(b, { cursor: 9 });
    f.navigation.close(a);
    expect(f.navigation.viewSessions.read(a)).toBeUndefined();
    expect(f.navigation.viewSessions.read(b)).toEqual({ cursor: 9 });
    f.navigation.dispose();
    expect(f.navigation.viewSessions.read(b)).toBeUndefined();
    expect(f.navigation.getSnapshot().pages).toEqual([]);
    expect(f.navigation.request("journal")).toBe(false);
  });
  it("restores fixed repository pages only after the save and switch succeeds", async () => {
    const f = fixture(),
      a = f.add(f.note("a"), "pinned");
    f.navigation.setRepository("two");
    const b = f.add(f.note("b", "two"), "pinned");
    f.setAvailable(false);
    let finish!: () => void;
    const switching = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const result = f.navigation.switchRepository("one", () => switching);
    expect(f.navigation.getSnapshot().activePageId).toBe(b);
    finish();
    await result;
    expect(f.navigation.getSnapshot().activePageId).toBe(a);
    f.setAvailable(true);
    f.navigation.reconcile("notes");
    expect(f.selected()?.target.id).toBe("a");
  });
  it("retains the old repository and tab when the existing save check fails", async () => {
    const f = fixture(),
      a = f.add(f.note("a"), "pinned"),
      reportError = vi.fn();
    f.navigation.setGuards({
      canRelease: () => true,
      beforeClose: () => {},
      reportError,
    });
    expect(
      await f.navigation.switchRepository("two", async () => {
        throw new Error("save failed");
      }),
    ).toBe(false);
    expect(f.navigation.getRepositoryId()).toBe("one");
    expect(f.navigation.getSnapshot().activePageId).toBe(a);
    expect(reportError).toHaveBeenCalledOnce();
  });
  it("does not activate notes when a repository response arrives after newer global navigation", async () => {
    const f = fixture();
    f.add(f.note("a"), "pinned");
    let finish!: () => void;
    const switching = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const result = f.navigation.switchRepository("two", () => switching);
    const search = describePage("search", "activity", "search", "搜索");
    const key = f.add(search);
    f.navigation.setRepository("two");
    finish();
    await result;
    expect(f.navigation.getSnapshot().activePageId).toBe(key);
  });
  it("follows newly selected reference targets once without reopening a closed page", () => {
    const f = fixture();
    f.add(f.note("a"), "pinned");
    f.navigation.reconcile("notes");
    const target = f.note("b"),
      key = pageKey(target.target);
    f.pages.set(key, target);
    f.setSelected(target);
    f.navigation.reconcile("notes");
    expect(f.navigation.getSnapshot().activePageId).toBe(key);
    f.navigation.close(key);
    f.navigation.reconcile("notes");
    expect(
      f.navigation.getSnapshot().pages.some((page) => page.key === key),
    ).toBe(false);
  });
});
