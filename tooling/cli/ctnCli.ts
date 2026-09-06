import { buildApiOperationPath, resolveApiRoute, getApiRouteOperation, parseApiOperationRequest, parseApiOperationResponse } from "../../contracts/api/index.ts";
// SPDX-License-Identifier: GPL-3.0-or-later

import type { ReadStream, WriteStream } from "node:tty";
import { pathToFileURL } from "node:url";
import {
  cliMaximumTrustedClientSecretCharacters,
  CliCredentialStore,
  validateCliTrustedClientSecret,
} from "./credentialStore.ts";
import {
  CliApiError,
  type CliApiClient,
  CliHttpClient,
  normalizeCliOrigin,
} from "./httpClient.ts";
import { readCliFile, writeCliFileAtomically } from "./checkoutFile.ts";

type CliIo = {
  error(message: string): void;
  output(message: string): void;
  readSecret(): Promise<string>;
};

type CliDependencies = {
  createClient?(profile: { origin: string; secret: string }): CliApiClient;
  credentialStore?: CliCredentialStore;
  io?: CliIo;
};

class CliInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliInputError";
  }
}

function printJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

async function readSecretFromTty() {
  const input = process.stdin as ReadStream;
  const output = process.stderr as WriteStream;

  if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== "function") {
    throw new CliInputError("Trusted-client secret must be entered from a TTY");
  }
  output.write("可信客户端 secret：");
  input.setRawMode(true);
  input.resume();
  let secret = "";

  try {
    await new Promise<void>((resolve, reject) => {
      const onData = (chunk: Buffer) => {
        for (const byte of chunk) {
          if (byte === 3) {
            cleanup();
            reject(new CliInputError("Secret input was cancelled"));
            return;
          }
          if (byte === 10 || byte === 13) {
            cleanup();
            resolve();
            return;
          }
          if (byte === 8 || byte === 127) {
            secret = secret.slice(0, -1);
          } else {
            if (secret.length >= cliMaximumTrustedClientSecretCharacters) {
              cleanup();
              reject(new CliInputError("Trusted-client secret is too long"));
              return;
            }
            secret += String.fromCharCode(byte);
          }
        }
      };
      const cleanup = () => input.off("data", onData);

      input.on("data", onData);
    });
  } finally {
    input.setRawMode(false);
    input.pause();
    output.write("\n");
  }
  try {
    return validateCliTrustedClientSecret(secret);
  } catch {
    throw new CliInputError("Trusted-client secret is invalid");
  }
}

function defaultIo(): CliIo {
  return {
    error: (message) => console.error(message),
    output: (message) => console.log(message),
    readSecret: readSecretFromTty,
  };
}

function takeOption(args: string[], name: string) {
  const index = args.indexOf(name);

  if (index < 0) return null;
  const value = args[index + 1];

  if (!value || value.startsWith("--")) {
    throw new CliInputError(`${name} requires a value`);
  }
  args.splice(index, 2);
  return value;
}

function requireOption(args: string[], name: string) {
  const value = takeOption(args, name);

  if (!value) throw new CliInputError(`${name} is required`);
  return value;
}

function assertNoArguments(args: string[]) {
  if (args.length > 0) {
    throw new CliInputError(`Unsupported arguments: ${args.join(" ")}`);
  }
}

async function selectProfile(
  store: CliCredentialStore,
  profileName: string | null,
) {
  const state = await store.read();
  const selected = profileName ?? state.defaultProfile;

  if (!selected) throw new CliInputError("No default CLI profile is selected");
  const profile = state.profiles.find(({ name }) => name === selected);

  if (!profile) throw new CliInputError(`CLI profile does not exist: ${selected}`);
  return profile;
}

function syncPath(domain: string, repositoryId: string | null) {
  if (domain === "workspace") {
    if (!repositoryId) throw new CliInputError("Workspace sync requires --repository");
    return buildApiOperationPath("getWorkspaceSyncSnapshot", { repositoryId });
  }
  if (repositoryId) throw new CliInputError("--repository is only valid for workspace");
  if (domain === "journal" || domain === "todo") {
    return buildApiOperationPath(domain === "journal" ? "getJournalSyncSnapshot" : "getTodoSyncSnapshot");
  }
  throw new CliInputError(`Unsupported sync domain: ${domain}`);
}

type Snapshot = { content: unknown; revision: `sha256:${string}` };

function syncOperation(path: string, method: "GET" | "PUT") {
  const route = resolveApiRoute(path);
  if (!route) throw new CliInputError("Unknown sync operation");
  return getApiRouteOperation(route, method);
}

function parseSnapshot(value: unknown, path: string): Snapshot {
  return parseApiOperationResponse(syncOperation(path, "GET").operationId, 200, value) as Snapshot;
}

function parseCheckout(source: string, path: string) {
  let value: unknown;

  try {
    value = JSON.parse(source) as unknown;
  } catch {
    throw new CliInputError("Checkout file is not valid JSON");
  }
  return parseApiOperationRequest(syncOperation(path, "PUT"), value) as { base: Snapshot; content: unknown };
}

function checkoutSource(snapshot: { content: unknown; revision: string }) {
  return `${printJson({ base: snapshot, content: snapshot.content })}\n`;
}

async function reconcileFinalizeFailure({
  api,
  checkoutFile,
  checkoutOriginal,
  error,
  io,
  path,
}: {
  api: CliApiClient;
  checkoutFile: string;
  checkoutOriginal: string;
  error: CliApiError;
  io: CliIo;
  path: string;
}) {
  const afterRevision = error.error.code === "operation_audit_finalize_failed"
    ? error.error.details.afterRevision
    : null;
  let checkoutUpdated = false;
  let currentRevision: string | null = null;

  if (afterRevision) {
    try {
      const snapshot = parseSnapshot(await api.request("GET", path), path);

      currentRevision = snapshot.revision;
      if (snapshot.revision === afterRevision) {
        checkoutUpdated = await writeCliFileAtomically(
          checkoutFile,
          checkoutSource(snapshot),
          checkoutOriginal,
        );
      }
    } catch {
      // Reconciliation is intentionally best effort and never replays the PUT.
    }
  }
  io.error(printJson({
    checkoutUpdated,
    currentRevision,
    error: error.error,
  }));
  return 6;
}

async function runAuth(
  args: string[],
  store: CliCredentialStore,
  io: CliIo,
) {
  const command = args.shift();

  if (command === "add") {
    const name = requireOption(args, "--profile");
    const origin = normalizeCliOrigin(requireOption(args, "--server"));

    assertNoArguments(args);
    let secret: string;

    try {
      secret = validateCliTrustedClientSecret(await io.readSecret());
    } catch {
      throw new CliInputError("Trusted-client secret is invalid");
    }
    const state = await store.read();

    if (state.profiles.some((profile) => profile.name === name)) {
      throw new CliInputError(`CLI profile already exists: ${name}`);
    }
    state.profiles.push({ name, origin, secret });
    if (state.profiles.length === 1) state.defaultProfile = name;
    await store.write(state);
    io.output(printJson({ default: state.defaultProfile === name, name, origin }));
    return 0;
  }
  if (command === "use") {
    const name = requireOption(args, "--profile");

    assertNoArguments(args);
    const state = await store.read();

    if (!state.profiles.some((profile) => profile.name === name)) {
      throw new CliInputError(`CLI profile does not exist: ${name}`);
    }
    state.defaultProfile = name;
    await store.write(state);
    io.output(printJson({ defaultProfile: name }));
    return 0;
  }
  if (command === "list") {
    assertNoArguments(args);
    const state = await store.read();

    io.output(printJson({
      defaultProfile: state.defaultProfile,
      profiles: state.profiles.map(({ name, origin }) => ({ name, origin })),
    }));
    return 0;
  }
  if (command === "remove") {
    const name = requireOption(args, "--profile");

    assertNoArguments(args);
    const state = await store.read();
    const index = state.profiles.findIndex((profile) => profile.name === name);

    if (index < 0) throw new CliInputError(`CLI profile does not exist: ${name}`);
    state.profiles.splice(index, 1);
    if (state.defaultProfile === name) state.defaultProfile = null;
    await store.write(state);
    io.output(printJson({ defaultProfile: state.defaultProfile, removed: name }));
    return 0;
  }
  throw new CliInputError("Usage: ctn auth add|use|list|remove");
}

async function runSync(
  args: string[],
  api: CliApiClient,
  io: CliIo,
) {
  const command = args.shift();
  const domain = args.shift();

  if (!domain) throw new CliInputError("Sync domain is required");
  const repositoryId = takeOption(args, "--repository");
  const path = syncPath(domain, repositoryId);

  if (command === "checkout") {
    const output = requireOption(args, "--output");

    assertNoArguments(args);
    const snapshot = parseSnapshot(await api.request("GET", path), path);

    await writeCliFileAtomically(output, checkoutSource(snapshot));
    io.output(printJson({ output, revision: snapshot.revision }));
    return 0;
  }
  if (command === "commit") {
    const file = requireOption(args, "--file");

    assertNoArguments(args);
    const original = await readCliFile(file);
    const checkout = parseCheckout(original, path);

    try {
      const response = parseApiOperationResponse(syncOperation(path, "PUT").operationId, 200,
        await api.request("PUT", path, checkout)) as { outcome: string; snapshot: Snapshot };
      const snapshot = response.snapshot;
      const updated = await writeCliFileAtomically(
        file,
        checkoutSource(snapshot),
        original,
      );

      if (!updated) {
        io.error(printJson({
          checkoutUpdated: false,
          currentRevision: snapshot.revision,
          message: "Content committed, but the checkout changed during the request",
        }));
        return 6;
      }
      io.output(printJson({
        checkoutUpdated: true,
        outcome: response.outcome,
        revision: snapshot.revision,
      }));
      return 0;
    } catch (error) {
      if (
        error instanceof CliApiError &&
        error.error.code === "operation_audit_finalize_failed"
      ) {
        return reconcileFinalizeFailure({
          api,
          checkoutFile: file,
          checkoutOriginal: original,
          error,
          io,
          path,
        });
      }
      throw error;
    }
  }
  throw new CliInputError("Usage: ctn sync checkout|commit <domain>");
}

function exitCodeFor(error: unknown) {
  if (error instanceof CliInputError) return 2;
  if (error instanceof CliApiError) {
    if (error.status === 401 || error.status === 403) return 3;
    if (error.error.code === "operation_audit_finalize_failed") return 6;
    if (
      error.error.code === "merge_conflict" ||
      error.error.code === "domain_validation_failed" ||
      error.error.code === "invalid_request" ||
      error.error.code === "proposal_stale"
    ) return 4;
    if (error.error.retryable) return 5;
    return 1;
  }
  if (error instanceof Error && error.message.startsWith("API network request failed:")) {
    return 5;
  }
  return 1;
}

export async function runCtnCli(
  inputArguments: readonly string[],
  dependencies: CliDependencies = {},
) {
  const args = [...inputArguments];
  const io = dependencies.io ?? defaultIo();
  const store = dependencies.credentialStore ?? new CliCredentialStore();

  try {
    const command = args.shift();

    if (command === "auth") return await runAuth(args, store, io);
    const profileName = takeOption(args, "--profile");
    const profile = await selectProfile(store, profileName);
    const api = dependencies.createClient?.(profile) ?? new CliHttpClient(profile);

    if (command === "openapi") {
      assertNoArguments(args);
      io.output(printJson(await api.request("GET", buildApiOperationPath("getOpenApi"))));
      return 0;
    }
    if (command === "request") {
      const method = args.shift()?.toUpperCase();
      const path = args.shift();
      const bodyFile = takeOption(args, "--body");

      if (!method || !path) throw new CliInputError("Request method and path are required");
      assertNoArguments(args);
      let body: unknown;

      if (bodyFile) {
        try {
          body = JSON.parse(await readCliFile(bodyFile)) as unknown;
        } catch (error) {
          if (error instanceof SyntaxError) {
            throw new CliInputError("Request body file is not valid JSON");
          }
          throw error;
        }
      }

      io.output(printJson(await api.request(method, path, body)));
      return 0;
    }
    if (command === "sync") return await runSync(args, api, io);
    throw new CliInputError("Usage: ctn auth|openapi|request|sync");
  } catch (error) {
    const code = exitCodeFor(error);

    if (error instanceof CliApiError) io.error(printJson(error.error));
    else io.error(error instanceof Error ? error.message : "Unknown CLI error");
    return code;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = await runCtnCli(process.argv.slice(2));
}
