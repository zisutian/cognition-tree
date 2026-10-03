import { dragTreeRow } from "../support/treeDrag";
import { parseCtnBlockMetadataLine } from "../../core/ctn/metadata/blockMetadata";
import { expect, type APIRequestContext } from "@playwright/test";
import type { WorkspaceRepositorySnapshotDto } from "../../contracts/workspace/types";
import { test } from "../support/e2eTest";
import { seedWorkbenchRepository, seedInteractionRepository } from "../support/repositorySeeds";
import { openWorkbench, selectNotesMode, openRepositoryFromContext } from "../support/workbenchPage";

const repositoryId = "batch-move-workbench";
const otherRepositoryId = "batch-move-other";
const alphaSource = "Alpha\n\t- Move Parent\n\t\t: Move Child\n\t- Middle\n\t- Last\n\t> [[Beta]]";
async function snapshot(api: APIRequestContext, id = repositoryId) {
  return await (await api.get(`/api/v4/sync/workspaces/${id}`)).json() as WorkspaceRepositorySnapshotDto;
}

test.beforeEach(async ({ api }) => {
  await seedWorkbenchRepository(api, repositoryId, { alphaSource });
  await seedInteractionRepository(api, otherRepositoryId);
});

test("directory selection, keyboard focus and opened note remain independent", async ({ page }) => {
  await openWorkbench(page, repositoryId);
  const tree = page.getByRole("tree", { name: "笔记目录" });
  const alpha = tree.getByRole("treeitem", { name: "Alpha", exact: true });
  const gamma = tree.getByRole("treeitem", { name: "Gamma", exact: true });
  const editor = page.getByRole("region", { name: "笔记编辑" }).locator(".cm-content");
  await alpha.click();
  await gamma.click({ modifiers: ["Control"] });
  await expect(tree.getByRole("treeitem", { selected: true })).toHaveCount(2);
  await expect(editor).toContainText("Alpha");
  await tree.press("Home");
  await tree.press("End");
  await expect(editor).toContainText("Alpha");
  await expect(tree.getByRole("treeitem", { selected: true })).toHaveCount(2);
  await gamma.click({ button: "right" });
  const menu = page.getByRole("menu", { name: "目录操作" });
  await expect(menu.getByRole("menuitem", { name: "重命名" })).toHaveCount(0);
  await expect(menu.getByRole("menuitem", { name: "删除" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("complementary", { name: "上下文区域" }).getByRole("button", { name: "新建笔记", exact: true }).click();
  await expect(tree.getByRole("treeitem", { name: "未命名笔记", exact: true })).toHaveAttribute("aria-level", "1");
});

test("directory keyboard range survives mode changes and moves all hidden rows from the toolbar", async ({ page, api }) => {
  await openWorkbench(page, repositoryId);
  const tree = page.getByRole("tree", { name: "笔记目录" });
  await tree.getByRole("treeitem", { name: "Alpha", exact: true }).click();
  await tree.press("Shift+ArrowDown");
  await expect(tree.getByRole("treeitem", { selected: true })).toHaveCount(2);
  await expect(page.getByRole("region", { name: "笔记编辑" }).locator(".cm-content")).toContainText("Alpha");
  await selectNotesMode(page, "结构");
  await expect(tree.getByRole("treeitem", { selected: true })).toHaveCount(2);
  await selectNotesMode(page, "编辑");
  await expect(tree.getByRole("treeitem", { selected: true })).toHaveCount(2);
  await tree.press("Home");
  await tree.press("ArrowDown");
  await tree.press("ArrowDown");
  await tree.press("ArrowLeft");
  await tree.press("ArrowLeft");
  await expect(tree.getByRole("treeitem", { name: "资料", exact: true })).toHaveAttribute("aria-expanded", "false");
  await expect(tree.getByRole("treeitem", { selected: true })).toHaveCount(0);
  const move = page.getByRole("complementary", { name: "上下文区域" }).getByRole("button", { name: "移动选中项…" });
  await expect(move).toBeEnabled();
  const before = await snapshot(api);
  await move.click();
  await page.keyboard.press("Escape");
  await expect(move).toBeFocused();
  expect(await snapshot(api)).toEqual(before);
  await move.click();
  await page.getByRole("dialog", { name: "移动到" }).getByRole("option", { name: "根目录", exact: true }).click();
  await expect(tree.getByRole("treeitem", { name: "Alpha", exact: true })).toHaveAttribute("aria-level", "1");
  await expect(tree.getByRole("treeitem", { name: "Beta", exact: true })).toHaveAttribute("aria-level", "1");
  await expect(tree.getByRole("treeitem", { selected: true })).toHaveCount(2);
});

test("single selected folder owns new-item placement and its completed focus request is not replayed", async ({ page }) => {
  await openWorkbench(page, repositoryId);
  const context = page.getByRole("complementary", { name: "上下文区域" });
  const tree = page.getByRole("tree", { name: "笔记目录" });
  await tree.getByRole("treeitem", { name: "资料", exact: true }).click();
  await context.getByRole("button", { name: "新建笔记", exact: true }).click();
  await expect(tree.getByRole("treeitem", { name: "未命名笔记", exact: true })).toHaveAttribute("aria-level", "2");
  await tree.getByRole("treeitem", { name: "资料", exact: true }).click();
  await context.getByRole("button", { name: "新建文件夹" }).click();
  await context.getByRole("textbox", { name: "文件夹名称" }).fill("子文件夹");
  await context.getByRole("button", { name: "确定", exact: true }).click();
  await expect(tree.getByRole("treeitem", { name: "子文件夹", exact: true })).toHaveAttribute("aria-level", "2");
  await tree.getByRole("treeitem", { name: "Gamma", exact: true }).click();
  await tree.getByRole("treeitem", { name: "Alpha", exact: true }).click({ modifiers: ["Control"] });
  await selectNotesMode(page, "结构");
  await selectNotesMode(page, "编辑");
  await expect(tree.getByRole("treeitem", { selected: true })).toHaveCount(2);
  await expect(tree.getByRole("treeitem", { name: "子文件夹", exact: true })).toHaveAttribute("aria-selected", "false");
});

test("real directory drag moves mixed roots once and removes selected descendants from the batch", async ({ page, api }, testInfo) => {
  await openWorkbench(page, repositoryId);
  const context = page.getByRole("complementary", { name: "上下文区域" });
  await context.getByRole("button", { name: "新建文件夹" }).click();
  await context.getByRole("textbox", { name: "文件夹名称" }).fill("接收目录");
  await context.getByRole("button", { name: "确定", exact: true }).click();
  await expect.poll(async () => (await snapshot(api)).content.workspace.tree.some((node) => node.kind === "folder" && node.title === "接收目录")).toBe(true);
  const tree = page.getByRole("tree", { name: "笔记目录" });
  const guides = tree.getByRole("treeitem", { name: "资料", exact: true });
  const alpha = tree.getByRole("treeitem", { name: "Alpha", exact: true });
  const gamma = tree.getByRole("treeitem", { name: "Gamma", exact: true });
  await alpha.click();
  await guides.click({ modifiers: ["Control"] });
  await gamma.click({ modifiers: ["Control"] });
  await expect(tree.getByRole("treeitem", { selected: true })).toHaveCount(3);
  await gamma.dragTo(tree.getByRole("treeitem", { name: "接收目录", exact: true }));
  await expect(guides).toHaveAttribute("aria-level", "2");
  await expect(gamma).toHaveAttribute("aria-level", "2");
  await expect(alpha).toHaveAttribute("aria-level", "3");
  await expect(tree.getByRole("treeitem", { selected: true })).toHaveCount(3);
  await expect.poll(async () => {
    const roots = (await snapshot(api)).content.workspace.tree;
    const receiver = roots.find((node) => node.kind === "folder" && node.title === "接收目录");
    return receiver?.kind === "folder" ? receiver.children.map((node) => node.kind === "folder" ? node.title : node.noteId) : [];
  }).toEqual(["资料", "note-gamma"]);
  await page.screenshot({ path: testInfo.outputPath("directory-batch.png") });
});

test("within-note mouse batch carries subtrees and preserves non-adjacent source order", async ({ page, api }, testInfo) => {
  await openWorkbench(page, repositoryId);
  await selectNotesMode(page, "结构");
  await page.getByRole("radio", { name: "笔记内迁移", exact: true }).click();
  const tree = page.getByRole("tree", { name: "笔记结构操作" });
  const parent = tree.getByRole("treeitem", { name: "Move Parent", exact: true });
  const last = tree.getByRole("treeitem", { name: "Last", exact: true });
  const child = tree.getByRole("treeitem", { name: "Move Child", exact: true });
  await parent.click({ modifiers: ["Control"] });
  await last.click({ modifiers: ["Control"] });
  await expect(tree.getByRole("treeitem", { selected: true })).toHaveCount(2);
  await expect(child).toHaveAttribute("aria-selected", "false");
  await last.dragTo(tree.getByRole("treeitem", { name: "Middle", exact: true }));
  await expect(parent).toHaveAttribute("aria-level", "2");
  await expect(last).toHaveAttribute("aria-level", "2");
  await expect(child).toHaveAttribute("aria-level", "3");
  await expect(tree.getByRole("treeitem", { selected: true })).toHaveCount(0);
  await expect.poll(async () => (await snapshot(api)).content.workspace.notes.find((note) => note.id === "note-alpha")?.source.replace(/^.*@ctn-block.*\n?/gm, "")).toContain("\t- Middle\n\t\t- Move Parent\n\t\t\t: Move Child\n\t\t- Last");
  await page.screenshot({ path: testInfo.outputPath("structure-batch.png") });
});

test("structure context-menu batch accepts a rapid double click only once", async ({ page, api }) => {
  await openWorkbench(page, repositoryId);
  await selectNotesMode(page, "结构");
  await page.getByRole("radio", { name: "笔记内迁移", exact: true }).click();
  const tree = page.getByRole("tree", { name: "笔记结构操作" });
  await tree.getByRole("treeitem", { name: "Move Parent", exact: true }).click({ modifiers: ["Control"] });
  const last = tree.getByRole("treeitem", { name: "Last", exact: true });
  await last.click({ modifiers: ["Control"] });
  await last.click({ button: "right" });
  await page.getByRole("menu", { name: "结构块操作" }).getByRole("menuitem", { name: "移动到…" }).click();
  const picker = page.getByRole("dialog", { name: "移动结构块" });
  await picker.getByRole("option", { name: /作为子节点.*Middle/ }).dblclick();
  await expect(picker).toBeHidden();
  await expect(tree.getByRole("treeitem", { selected: true })).toHaveCount(0);
  await expect(tree.getByRole("treeitem", { name: "Move Parent", exact: true })).toHaveAttribute("aria-level", "2");
  await expect.poll(async () => {
    const source = (await snapshot(api)).content.workspace.notes.find((note) => note.id === "note-alpha")!.source;
    return [source.match(/Move Parent/g)?.length, source.match(/Move Child/g)?.length, source.match(/Last/g)?.length];
  }).toEqual([1, 1, 1]);
});

test("cross-note batch uses an unselectable target and transfers full source identities", async ({ page, api }) => {
  await openWorkbench(page, otherRepositoryId);
  const before = await snapshot(api, otherRepositoryId);
  const sourceBefore = before.content.workspace.notes.find((note) => note.id === "interaction-source")!.source;
  const identities = sourceBefore.split("\n").flatMap((line) => { const meta = parseCtnBlockMetadataLine(line); return meta ? [meta.id] : []; }).slice(1);
  expect(identities).toHaveLength(3);
  await selectNotesMode(page, "结构");
  const source = page.getByRole("tree", { name: "源笔记结构" });
  const target = page.getByRole("tree", { name: "目标笔记结构" });
  await source.getByRole("treeitem", { name: "Source Child", exact: true }).click({ modifiers: ["Control"] });
  const sibling = source.getByRole("treeitem", { name: "Source Sibling", exact: true });
  await sibling.click({ modifiers: ["Control"] });
  await expect(source.getByRole("treeitem", { selected: true })).toHaveCount(2);
  await expect(target.getByRole("treeitem").first()).not.toHaveAttribute("aria-selected");
  await dragTreeRow(page, sibling, target.getByRole("treeitem", { name: "Target Child", exact: true }));
  await expect(source.getByRole("treeitem")).toHaveCount(0);
  await expect(target.getByRole("treeitem", { name: "Source Grandchild", exact: true })).toHaveAttribute("aria-level", "3");
  await expect.poll(async () => {
    const after = await snapshot(api, otherRepositoryId);
    const targetSource = after.content.workspace.notes.find((note) => note.id === "interaction-target")!.source;
    const sourceSource = after.content.workspace.notes.find((note) => note.id === "interaction-source")!.source;
    return identities.every((id) => targetSource.includes(id) && !sourceSource.includes(id));
  }).toBe(true);
  await selectNotesMode(page, "编辑");
  await expect(page.getByRole("region", { name: "笔记编辑" }).locator(".cm-content")).toContainText("Target");
});

test("hidden selection moves from the toolbar and cancel returns focus without changing content", async ({ page, api }) => {
  await openWorkbench(page, repositoryId);
  await selectNotesMode(page, "结构");
  await page.getByRole("radio", { name: "笔记内迁移", exact: true }).click();
  const tree = page.getByRole("tree", { name: "笔记结构操作" });
  const parent = tree.getByRole("treeitem", { name: "Move Parent", exact: true });
  await tree.getByRole("treeitem", { name: "Move Child", exact: true }).click();
  await tree.press("ArrowLeft");
  await tree.press("ArrowLeft");
  await expect(parent).toHaveAttribute("aria-expanded", "false");
  await expect(tree.getByRole("treeitem", { selected: true })).toHaveCount(0);
  const before = await snapshot(api);
  const move = page.getByRole("region", { name: "结构操作" }).getByRole("button", { name: "移动选中项…" });
  await expect(move).toBeEnabled();
  await move.click();
  const picker = page.getByRole("dialog", { name: "移动结构块" });
  await expect(picker).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(picker).toBeHidden();
  await expect(move).toBeFocused();
  expect(await snapshot(api)).toEqual(before);
  await move.click();
  await picker.getByRole("option", { name: /文末根块/ }).click();
  await expect(tree.getByRole("treeitem", { name: "Move Child", exact: true })).toHaveAttribute("aria-level", "1");
});

test("right-click batch picker releases its menu before committing and rejects all conflicting roots", async ({ page, api }) => {
  await openWorkbench(page, repositoryId);
  const tree = page.getByRole("tree", { name: "笔记目录" });
  const gamma = tree.getByRole("treeitem", { name: "Gamma", exact: true });
  await gamma.click();
  await gamma.getByRole("button", { name: "重命名 Gamma", exact: true }).click();
  await tree.getByRole("textbox").fill("Alpha");
  await tree.getByRole("textbox").press("Enter");
  await expect.poll(async () => (await snapshot(api)).content.workspace.notes.find((note) => note.id === "note-gamma")?.source.includes("\nAlpha\n")).toBe(true);
  const renamed = tree.getByRole("treeitem", { name: "Alpha", exact: true }).last();
  const beta = tree.getByRole("treeitem", { name: "Beta", exact: true });
  await renamed.click();
  await beta.click({ modifiers: ["Control"] });
  const before = await snapshot(api);
  await renamed.click({ button: "right" });
  await page.getByRole("menu", { name: "目录操作" }).getByRole("menuitem", { name: "移动到…" }).click();
  const picker = page.getByRole("dialog", { name: "移动到" });
  await expect(picker).toBeVisible();
  await picker.getByRole("option", { name: "资料", exact: true }).click();
  await expect(picker).toBeHidden();
  await expect(page.getByRole("alert")).toContainText(/同名笔记/);
  await expect(tree.getByRole("treeitem", { selected: true })).toHaveCount(2);
  expect(await snapshot(api)).toEqual(before);
  await expect(renamed).toHaveAttribute("aria-level", "1");
  await expect(beta).toHaveAttribute("aria-level", "2");
  await dragTreeRow(page, renamed, tree.getByRole("treeitem", { name: "资料", exact: true }));
  await expect(page.getByRole("alert")).toContainText(/同名笔记/);
  expect(await snapshot(api)).toEqual(before);
  await expect(tree.getByRole("treeitem", { selected: true })).toHaveCount(2);
});

test("note and repository A to B to A switches discard earlier block selections and menus", async ({ page }) => {
  await openWorkbench(page, repositoryId);
  await selectNotesMode(page, "结构");
  await page.getByRole("radio", { name: "笔记内迁移", exact: true }).click();
  const tree = page.getByRole("tree", { name: "笔记结构操作" });
  await tree.getByRole("treeitem", { name: "Last", exact: true }).click();
  const directory = page.getByRole("tree", { name: "笔记目录" });
  await tree.getByRole("treeitem", { name: "Last", exact: true }).click({ button: "right" });
  await expect(page.getByRole("menu", { name: "结构块操作" })).toBeVisible();
  await directory.getByRole("treeitem", { name: "Beta", exact: true }).click();
  await expect(page.getByRole("menu", { name: "结构块操作" })).toBeHidden();
  await directory.getByRole("treeitem", { name: "Beta", exact: true }).click();
  await directory.getByRole("treeitem", { name: "Alpha", exact: true }).click();
  await expect(tree.getByRole("treeitem", { selected: true })).toHaveCount(0);
  await tree.getByRole("treeitem", { name: "Last", exact: true }).click();
  await selectNotesMode(page, "编辑");
  await openRepositoryFromContext(page, otherRepositoryId);
  await openRepositoryFromContext(page, repositoryId);
  await expect(page.getByRole("tree", { name: "笔记目录" }).getByRole("treeitem", { selected: true })).toHaveCount(0);
});
