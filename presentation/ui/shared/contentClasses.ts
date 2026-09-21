import contentStyles from "./Content.module.css";
import treeStyles from "./tree/Tree.module.css";
import { createClassNames as bindClassNames } from "./classNames.ts";
const contentClasses = bindClassNames(contentStyles, treeStyles);
/** Content fragments may compose only their own co-located styles. */
export function createClassNames(
  ...modules: Readonly<Record<string, string>>[]
) {
  const local = bindClassNames(...modules);
  return (...names: Array<string | false | null | undefined>) =>
    contentClasses(local(...names));
}
