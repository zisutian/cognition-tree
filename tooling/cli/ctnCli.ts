// SPDX-License-Identifier: GPL-3.0-or-later

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import type { ContentQueryDto } from "../../contracts/api/index.ts";
import {
  buildApiOperationPath,
  getApiOperation,
  parseApiOperationRequest,
  parseApiOperationResponse,
} from "../../contracts/api/index.ts";
import type {
  ContentOperationRequestDto,
  ContentOperationResultDto,
} from "../../contracts/content/index.ts";
import {
  CliApiError,
  CliHttpClient,
  normalizeCliOrigin,
  type CliApiClient,
} from "./httpClient.ts";

type CliIo = { error(message: string): void; output(message: string): void };
type CliDependencies = {
  createClient?(options: { origin: string }): CliApiClient;
  io?: CliIo;
};
class CliInputError extends Error {}
const usage = `ctn --server <本机服务地址> <命令>
  catalog
  directory|syntax <workspace|journal|todo> [--repository <仓库名称>]
  read <领域> --resource <标题或相对路径> [--block <块ID>] [--subtree]
  search <领域> --text <关键词> [--limit <1..100>]
  query --file <查询JSON>
  apply --file <操作JSON，含operationId与baseRevision>
  result <操作ID>
  openapi
Workspace 每次显式指定 --repository；不使用默认仓库或保存的凭据。`;
const json = (value: unknown) => JSON.stringify(value, null, 2);
function takeOption(args: string[], name: string) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value || value.startsWith("--"))
    throw new CliInputError(`${name} requires a value`);
  args.splice(index, 2);
  return value;
}
function required(args: string[], name: string) {
  const value = takeOption(args, name);
  if (!value) throw new CliInputError(`${name} is required`);
  return value;
}
function noArguments(args: string[]) {
  if (args.length)
    throw new CliInputError(`Unsupported arguments: ${args.join(" ")}`);
}
async function jsonFile(file: string) {
  const source = await readFile(file, "utf8");
  if (Buffer.byteLength(source) > 4 * 1024 * 1024)
    throw new CliInputError("JSON input exceeds 4 MiB");
  try {
    return JSON.parse(source) as unknown;
  } catch {
    throw new CliInputError("Input file is not valid JSON");
  }
}
function namedQuery(command: string, args: string[]): ContentQueryDto {
  const domain = args.shift();
  const repository = takeOption(args, "--repository");
  if (domain !== "workspace" && domain !== "journal" && domain !== "todo")
    throw new CliInputError(
      "Explicit domain must be workspace, journal or todo",
    );
  if (domain === "workspace" && !repository)
    throw new CliInputError("Workspace requires --repository <name>");
  if (domain !== "workspace" && repository)
    throw new CliInputError("--repository only applies to Workspace");
  const scope =
    domain === "workspace"
      ? ({ domain, repository: repository! } as const)
      : ({ domain } as const);
  let result: ContentQueryDto;
  if (command === "read") {
    const resource = required(args, "--resource");
    const blockId = takeOption(args, "--block");
    const subtreeIndex = args.indexOf("--subtree");
    if (subtreeIndex >= 0) args.splice(subtreeIndex, 1);
    result = {
      kind: "read",
      scope,
      resource,
      ...(blockId ? { blockId } : {}),
      ...(subtreeIndex >= 0 ? { subtree: true } : {}),
    };
  } else if (command === "search") {
    result = {
      kind: "search",
      scope,
      text: required(args, "--text"),
      limit: Number(takeOption(args, "--limit") ?? 20),
    };
  } else if (command === "directory" || command === "syntax")
    result = { kind: command, scope };
  else throw new CliInputError(usage);
  noArguments(args);
  return result;
}
async function call(
  api: CliApiClient,
  operationId: string,
  body?: unknown,
  parameters: { operationId?: string } = {},
) {
  const operation = getApiOperation(operationId);
  const request = operation.body
    ? parseApiOperationRequest(operation, body)
    : undefined;
  const response = await api.request(
    operation.method,
    buildApiOperationPath(operationId, parameters),
    request,
  );
  // Both accepted and finished content operations use the same registry-owned result schema.
  return parseApiOperationResponse(operationId, 200, response);
}
function exitCode(error: unknown) {
  if (error instanceof CliInputError) return 2;
  if (error instanceof CliApiError) {
    if (error.status === 401 || error.status === 403) return 3;
    if (
      error.error.code === "content_commit_indeterminate" ||
      error.error.code === "operation_audit_finalize_failed"
    )
      return 6;
    if (error.status === 400 || error.status === 409 || error.status === 422)
      return 4;
    if (error.error.retryable) return 5;
  }
  return 1;
}
export async function runCtnCli(
  inputArguments: readonly string[],
  dependencies: CliDependencies = {},
) {
  const io = dependencies.io ?? { error: console.error, output: console.log };
  const args = [...inputArguments];
  let submitting: ContentOperationRequestDto | null = null;
  try {
    if (
      args.length === 0 ||
      (args.length === 1 && ["--help", "help"].includes(args[0]!))
    ) {
      io.output(usage);
      return 0;
    }
    const origin = normalizeCliOrigin(required(args, "--server"));
    const command = args.shift();
    const api =
      dependencies.createClient?.({ origin }) ?? new CliHttpClient({ origin });
    let result: unknown;
    if (command === "catalog" || command === "openapi") {
      noArguments(args);
      result = await call(
        api,
        command === "catalog" ? "queryLocalContent" : "getOpenApi",
        command === "catalog" ? { kind: "catalog" } : undefined,
      );
    } else if (command === "result") {
      const operationId = args.shift();
      if (!operationId) throw new CliInputError("Operation ID is required");
      noArguments(args);
      result = await call(api, "getContentOperation", undefined, {
        operationId,
      });
    } else if (command === "query" || command === "apply") {
      const file = required(args, "--file");
      noArguments(args);
      const body = await jsonFile(file);
      if (command === "apply") {
        submitting = parseApiOperationRequest(
          getApiOperation("executeContentOperation"),
          body,
        ) as ContentOperationRequestDto;
        result = await call(api, "executeContentOperation", submitting);
      } else result = await call(api, "queryLocalContent", body);
    } else
      result = await call(
        api,
        "queryLocalContent",
        namedQuery(command ?? "", args),
      );
    io.output(json(result));
    if (command === "apply" || command === "result") {
      const receipt = result as ContentOperationResultDto;
      if (
        receipt.status === "pending" ||
        receipt.status === "indeterminate" ||
        receipt.audit === "failed"
      )
        return 6;
      if (receipt.status !== "committed") return 4;
    }
    return 0;
  } catch (error) {
    if (submitting)
      io.error(
        json({
          operationId: submitting.operationId,
          message:
            "Query this operation ID and inspect affected content before considering another submission. No automatic replay was performed.",
        }),
      );
    io.error(
      error instanceof CliApiError
        ? json(error.error)
        : error instanceof Error
          ? error.message
          : "Unknown CLI error",
    );
    return submitting && !(error instanceof CliApiError) ? 6 : exitCode(error);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = await runCtnCli(process.argv.slice(2));
