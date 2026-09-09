// SPDX-License-Identifier: GPL-3.0-or-later

import {
  ContentEditSchema,
  contentCommandDefinitions,
} from "../../contracts/content/index.ts";

export const cliUsage = `ctn --server <本机服务地址> <命令>
  catalog
  directory|syntax <workspace|journal|todo> [--repository <仓库名称>]
  read <领域> --resource <标题或相对路径> [--block <块ID>] [--subtree]
  search <领域> --text <关键词> [--limit <1..100>]
  query --file <查询JSON或->
  apply --from <查询响应JSON> --file <命令JSON或-> [--id <操作ID>]
  apply --file <完整操作JSON或-> [--id <操作ID>]
  result <操作ID>
  openapi
  help [领域或内容命令]
Workspace 每次显式指定 --repository；不使用默认仓库或保存的凭据。
apply 默认生成操作 ID，发送前打印到标准错误；不自动读取新版本或重放。`;

export function contentCommandHelp(selector?: string) {
  const edit = ContentEditSchema.anyOf.find(
    (schema) => schema.properties.kind.const === selector,
  );
  if (edit) return JSON.stringify(edit, null, 2);
  const selected = contentCommandDefinitions.filter(
    ({ domains, schema }) =>
      !selector ||
      domains.some((domain) => domain === selector) ||
      schema.properties.kind.const === selector,
  );
  if (!selected.length)
    throw new Error(`Unknown content domain or command: ${selector}`);
  if (
    selected.length === 1 &&
    selected[0]!.schema.properties.kind.const === selector
  )
    return JSON.stringify(selected[0], null, 2);
  return selected
    .map(
      ({ domains, schema }) =>
        `${schema.properties.kind.const} [${domains.join(", ")}]  ${Object.keys(
          schema.properties,
        )
          .filter((key) => key !== "kind")
          .join(", ")}`,
    )
    .join("\n");
}
