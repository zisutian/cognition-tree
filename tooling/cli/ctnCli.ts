// SPDX-License-Identifier: GPL-3.0-or-later

import { randomUUID } from "node:crypto";
import { readCliJson, type CliInputStream } from "./jsonInput.ts";
import { cliUsage as usage, contentCommandHelp } from "./commandHelp.ts";
import { pathToFileURL } from "node:url";
import type { ContentQueryDto } from "../../contracts/api/index.ts";
import {
  buildApiOperationPath,
  getApiOperation,
  parseApiOperationRequest,
  parseApiError,
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
  stdin?: CliInputStream;
};
class CliInputError extends Error {}
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
    const cursor = takeOption(args, "--cursor");
    result = {
      kind: "search",
      scope,
      ...(cursor ? { cursor } : {}),
      text: required(args, "--text"),
      limit: Number(takeOption(args, "--limit") ?? 20),
    };
  } else if (command === "directory") {
    const parent = takeOption(args, "--parent");
    const cursor = takeOption(args, "--cursor");
    const limit = takeOption(args, "--limit");
    const recursive = args.indexOf("--recursive");
    if (recursive >= 0) args.splice(recursive, 1);
    result = {
      kind: command,
      scope,
      ...(parent ? { parent } : {}),
      ...(cursor ? { cursor } : {}),
      ...(limit ? { limit: Number(limit) } : {}),
      ...(recursive >= 0 ? { recursive: true } : {}),
    };
  } else if (command === "syntax") {
    const file = takeOption(args, "--file");
    const source = args.indexOf("--source");
    if (source >= 0) args.splice(source, 1);
    result = {
      kind: command,
      scope,
      ...(file ? { file } : {}),
      ...(source >= 0 ? { includeSource: true } : {}),
    };
  } else throw new CliInputError(usage);
  noArguments(args);
  return result;
}
async function call(
  api: CliApiClient,
  operationId: string,
  body?: unknown,
  parameters: { operationId?: string } = {},
  query?: Record<string, string | number>,
) {
  const operation = getApiOperation(operationId);
  const request = operation.body
    ? parseApiOperationRequest(operation, body)
    : undefined;
  const response = await api.request(
    operation.method,
    buildApiOperationPath(operationId, parameters, query),
    request,
  );
  if (
    response.status >= 400 &&
    response.body &&
    typeof response.body === "object" &&
    "code" in response.body
  )
    throw new CliApiError(response.status, parseApiError(response.body));
  return parseApiOperationResponse(operationId, response.status, response.body);
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
      io.output(`${usage}\n\n${contentCommandHelp()}`);
      return 0;
    }
    if (args[0] === "help") {
      args.shift();
      const selector = args.shift();
      noArguments(args);
      io.output(
        selector
          ? contentCommandHelp(selector)
          : `${usage}\n\n${contentCommandHelp()}`,
      );
      return 0;
    }
    if (args.includes("--help")) {
      takeOption(args, "--server");
      const filtered = args.filter((arg) => arg !== "--help");
      if (filtered.length !== 1)
        throw new CliInputError("Use ctn help <domain|command>");
      io.output(
        [
          "catalog",
          "directory",
          "syntax",
          "read",
          "search",
          "query",
          "apply",
          "result",
          "openapi",
        ].includes(filtered[0]!)
          ? usage
          : contentCommandHelp(filtered[0]),
      );
      return 0;
    }
    const origin = normalizeCliOrigin(required(args, "--server"));
    const command = args.shift();
    const api =
      dependencies.createClient?.({ origin }) ?? new CliHttpClient({ origin });
    let result: unknown;
    if (command === "catalog" || command === "openapi") {
      const content = command === "openapi" ? args.indexOf("--content") : -1;
      if (content >= 0) args.splice(content, 1);
      noArguments(args);
      result = await call(
        api,
        command === "catalog" ? "queryLocalContent" : "getOpenApi",
        command === "catalog" ? { kind: "catalog" } : undefined,
        {},
        content >= 0 ? { scope: "content" } : undefined,
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
      const from = command === "apply" ? takeOption(args, "--from") : null;
      const explicitId = command === "apply" ? takeOption(args, "--id") : null;
      noArguments(args);
      if (file === "-" && from === "-")
        throw new CliInputError("Only one input can consume stdin");
      const stdin = dependencies.stdin ?? process.stdin;
      let queryBody: unknown;
      try {
        const body = await readCliJson(file, stdin);
        if (command === "apply") {
          if (!body || typeof body !== "object" || Array.isArray(body))
            throw new CliInputError("Operation input must be an object");
          let payload: object = body;
          if (from) {
            const read = parseApiOperationResponse(
              "queryLocalContent",
              200,
              await readCliJson(from, stdin, 64 * 1024 * 1024),
            ) as { basis: unknown; scope: unknown };
            payload = { basis: read.basis, scope: read.scope, command: body };
          }
          const suppliedId =
            "operationId" in payload ? payload.operationId : undefined;
          if (
            suppliedId !== undefined &&
            explicitId &&
            explicitId !== suppliedId
          )
            throw new CliInputError(
              "--id differs from the operation ID in the input",
            );
          submitting = parseApiOperationRequest(
            getApiOperation("executeContentOperation"),
            {
              ...payload,
              operationId: explicitId ?? suppliedId ?? randomUUID(),
            },
          ) as ContentOperationRequestDto;
        } else
          queryBody = parseApiOperationRequest(
            getApiOperation("queryLocalContent"),
            body,
          );
      } catch (error) {
        if (error instanceof CliApiError) throw error;
        throw new CliInputError(
          error instanceof Error ? error.message : "Invalid JSON input",
        );
      }
      if (submitting) {
        io.error(
          json({
            operationId: submitting.operationId,
            message: "操作 ID 已生成；不确定时使用 result 查询，请勿自动重放。",
          }),
        );
        result = await call(api, "executeContentOperation", submitting);
      } else result = await call(api, "queryLocalContent", queryBody);
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
