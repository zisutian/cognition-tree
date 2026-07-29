// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  DomainChangeEventSource,
  DomainChangeNotification,
} from "../../application/sync/domainChangeEvents";
import { parseApiV1Event } from "../../contracts/api/parse";
import { resolveRepositoryApiUrl } from "./httpRepositoryTransport";

const initialReconnectDelayMs = 1_000;
const maximumReconnectDelayMs = 30_000;

function projectNotification(
  input: ReturnType<typeof parseApiV1Event>,
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
  };
}

function readSseData(frame: string) {
  const data = frame
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).replace(/^ /, ""))
    .join("\n");

  return data.length > 0 ? data : null;
}

export function createHttpApiV1EventSource({
  baseUrl = "http://127.0.0.1:3001",
  fetch: fetchFn = globalThis.fetch.bind(globalThis),
  token,
}: {
  baseUrl?: string;
  fetch?: typeof fetch;
  token?: string;
}): DomainChangeEventSource {
  const listeners = new Set<(event: DomainChangeNotification) => void>();
  let abortController: AbortController | null = null;
  let disposed = false;
  let reconnectDelayMs = initialReconnectDelayMs;
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
        resolveRepositoryApiUrl(baseUrl, "/api/v1/events"),
        {
          cache: "no-store",
          headers,
          signal: controller.signal,
        },
      );

      if (!response.ok || !response.body) {
        throw new Error(`CTN API event stream failed (${response.status}).`);
      }
      reconnectDelayMs = initialReconnectDelayMs;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (!disposed && !controller.signal.aborted) {
        const { done, value } = await reader.read();

        buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, "\n");
        let boundary = buffer.indexOf("\n\n");

        while (boundary >= 0) {
          const frame = buffer.slice(0, boundary);

          buffer = buffer.slice(boundary + 2);
          const data = readSseData(frame);

          if (data) {
            publish(projectNotification(parseApiV1Event(JSON.parse(data))));
          }
          boundary = buffer.indexOf("\n\n");
        }
        if (done) break;
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
          maximumReconnectDelayMs,
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
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
