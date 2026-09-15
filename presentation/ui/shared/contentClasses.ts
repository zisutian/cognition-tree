import appFrameStyles from "../AppFrame.module.css";
import problemsPanelStyles from "../problems/ProblemsPanel.module.css";
import statusBarStyles from "../workbench/StatusBar.module.css";
import { createClassNames as bindClassNames } from "./classNames.ts";
import compactContextListStyles from "./CompactContextList.module.css";
import contentStyles from "./Content.module.css";
import contextStyles from "./Context.module.css";
import formStatusStyles from "./FormStatus.module.css";
import managementListStyles from "./ManagementList.module.css";
import overlayStyles from "./Overlay.module.css";
import toolbarStyles from "./Toolbar.module.css";
import toolListStyles from "./ToolList.module.css";
import toolPropertyListStyles from "./ToolPropertyList.module.css";
import treeStyles from "./tree/Tree.module.css";

const sharedClasses = bindClassNames(
  appFrameStyles,
  problemsPanelStyles,
  statusBarStyles,
  contentStyles,
  toolbarStyles,
  toolPropertyListStyles,
  toolListStyles,
  formStatusStyles,
  managementListStyles,
  contextStyles,
  compactContextListStyles,
  overlayStyles,
  treeStyles,
);
/** Public class binding for content adapters. Leaf controls have a separate closed API. */
export function createClassNames(
  ...modules: Readonly<Record<string, string>>[]
) {
  const localClasses = bindClassNames(...modules);
  return (...names: Array<string | false | null | undefined>) =>
    sharedClasses(localClasses(...names));
}
