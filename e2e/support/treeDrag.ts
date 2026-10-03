import { expect, type Locator, type Page } from "@playwright/test";

/** Start a real native drag, then locate the target after drag feedback has changed layout. */
export async function dragTreeRow(page: Page, source: Locator, target: Locator, ratio = 0.5) {
  const initial = await source.boundingBox();
  if (!initial) throw new Error("Drag source is not visible");
  await page.mouse.move(initial.x + 12, initial.y + initial.height / 2);
  await page.mouse.down();
  await page.mouse.move(initial.x + 28, initial.y + initial.height / 2 + 8, { steps: 8 });
  await expect(source).toHaveAttribute("data-drag-source", "true");
  const destination = await target.boundingBox();
  if (!destination) throw new Error("Drag target is not visible");
  await page.mouse.move(destination.x + 12, destination.y + destination.height * ratio, { steps: 12 });
  await page.mouse.move(destination.x + 13, destination.y + destination.height * ratio, { steps: 2 });
  if (await target.getAttribute("role") === "treeitem") {
    await expect(target).toHaveAttribute("data-drop", /before|inside|after/);
  }
  await page.mouse.up();
}
