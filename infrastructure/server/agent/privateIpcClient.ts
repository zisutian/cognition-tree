// SPDX-License-Identifier: GPL-3.0-or-later

import { randomUUID } from "node:crypto";
import net from "node:net";
import type { AgentIpcRequestDto } from "../../../contracts/agent/index.ts";
import { listenToAgentJsonLines } from "./jsonLineTransport.ts";
import { parsePrivateIpcResult } from "./sessionMcpProtocol.ts";

const privateIpcRequestTimeoutMilliseconds = 60_000;

type AgentIpcToolCallRequest = Extract<
  AgentIpcRequestDto,
  { kind: "call-tool" }
>;

export type AgentPrivateIpcPayload =
  | { kind: "list-tools" }
  | { kind: "call-tool"; tool: AgentIpcToolCallRequest["tool"] };

export function callAgentPrivateIpc(input: Readonly<{
  capability: string;
  endpoint: string | net.NetConnectOpts;
  payload: AgentPrivateIpcPayload;
  sessionId: string;
}>) {
  return new Promise<unknown>((resolve, reject) => {
    const request: AgentIpcRequestDto = {
      capability: input.capability,
      id: randomUUID(),
      ...input.payload,
      sessionId: input.sessionId,
    };
    const socket = typeof input.endpoint === "string"
      ? net.createConnection(input.endpoint)
      : net.createConnection(input.endpoint);
    let responseLine: string | null = null;
    let settled = false;
    let stopReading: () => void = () => undefined;
    let timeout: NodeJS.Timeout | null = null;
    const finish = (settle: () => void) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      stopReading();
      socket.destroy();
      settle();
    };
    const fail = (error: Error) => finish(() => reject(error));

    timeout = setTimeout(() => {
      fail(new Error("Private Agent IPC request timed out"));
    }, privateIpcRequestTimeoutMilliseconds);
    timeout.unref();
    stopReading = listenToAgentJsonLines(socket, {
      onEnd() {
        if (responseLine === null) {
          fail(new Error("Private Agent IPC returned no response"));
          return;
        }
        try {
          const result = parsePrivateIpcResult(responseLine, request.id);

          finish(() => resolve(result));
        } catch (error) {
          fail(error instanceof Error
            ? error
            : new Error("Private Agent IPC response is invalid"));
        }
      },
      onFailure(failure) {
        fail(new Error(`Private Agent IPC response framing failed: ${failure}`));
      },
      onLine(line) {
        if (responseLine !== null) {
          fail(new Error("Private Agent IPC returned multiple responses"));
          return false;
        }
        responseLine = line;
        return true;
      },
    });
    socket.once("connect", () => {
      if (!settled) socket.write(`${JSON.stringify(request)}\n`);
    });
  });
}
