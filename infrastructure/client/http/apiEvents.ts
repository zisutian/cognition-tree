import {
  buildApiOperationPath,
  parseApiEvent,
} from "../../../contracts/api/index.ts";
// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  DomainChangeEventSource,
  DomainChangeNotification,
} from "../../../application/sync/index.ts";

import { resolveApiUrl } from "./apiTransport.ts";
import { readHttpSseData } from "./sseTransport.ts";

export const apiEventInitialReconnectDelayMs = 1_000;
export const apiEventMaximumReconnectDelayMs = 30_000;

function projectNotification(
  input: ReturnType<typeof parseApiEvent>,
): DomainChangeNotification {
  const resources = input.type === "change" ? input.changes.resources : [];

  return {
    checkpoint: input.checkpoint,
    changedDomains: {
      journal: resources.some(({ domain }) => domain === "journal"),
      todo: resources.some(({ domain }) => domain === "todo"),
      workspaceCatalog: resources.some(
        ({ domain, repositoryId, resourceId }) =>
          domain === "workspace" &&
          repositoryId !== undefined &&
          resourceId === repositoryId,
      ),
      workspaceRepositoryIds: [
        ...new Set(
          resources.flatMap(({ domain, repositoryId }) =>
            domain === "workspace" && repositoryId ? [repositoryId] : []
          ),
        ),
      ],
    },
    sequence: input.sequence,
    streamId: input.streamId,
  };
}

export function createHttpApiEventSource({
  baseUrl,
  fetch: fetchFn = globalThis.fetch.bind(globalThis),
  token,
}: {
  baseUrl: string;
  fetch?: typeof fetch;
  token?: string;
}): DomainChangeEventSource {
  const listeners = new Set<(event: DomainChangeNotification) => void>();
  let abortController: AbortController | null = null;
  let disposed = false;
  let reconnectDelayMs = apiEventInitialReconnectDelayMs;
  let reconnectTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  let started = false;

  const publish = (notification: DomainChangeNotification) => {
    for (const listener of listeners) listener(notification);
  };
  const clearReconnectTimer = () => {
    if (reconnectTimer === null) return;
    globalThis.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  };
  const connect = async (): Promise<void> => {
    if (disposed || !started || abortController) return;
    const controller = new AbortController();

    abortController = controller;
    try {
      const headers = new Headers({ Accept: "text/event-stream" });

      if (token) headers.set("Authorization", `Bearer ${token}`);
      const response = await fetchFn(
        resolveApiUrl(baseUrl, buildApiOperationPath("streamContentEvents")),
        {
          cache: "no-store",
          headers,
          signal: controller.signal,
        },
      );

      if (!response.ok || !response.body) {
        throw new Error(`CTN API event stream failed (${response.status}).`);
      }
      for await (const data of readHttpSseData(response)) {
        if (disposed || controller.signal.aborted) break;
        const notification = projectNotification(
          parseApiEvent(JSON.parse(data)),
        );

        reconnectDelayMs = apiEventInitialReconnectDelayMs;
        publish(notification);
      }
    } catch (error) {
      if (!controller.signal.aborted && !disposed) {
        // A failed SSE connection is only an invalidation-channel failure.
        // Repository reads remain authoritative and the reconnect checkpoint
        // repairs any missed interval.
        void error;
      }
    } finally {
      if (abortController === controller) abortController = null;
      if (!disposed && started) {
        const delay = reconnectDelayMs;

        reconnectDelayMs = Math.min(
          apiEventMaximumReconnectDelayMs,
          reconnectDelayMs * 2,
        );
        reconnectTimer = globalThis.setTimeout(() => {
          reconnectTimer = null;
          void connect();
        }, delay);
      }
    }
  };

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      started = false;
      clearReconnectTimer();
      abortController?.abort();
      abortController = null;
      listeners.clear();
    },
    start() {
      if (disposed || started) return;
      started = true;
      void connect();
    },
    subscribe(listener) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
