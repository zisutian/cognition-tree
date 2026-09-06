// SPDX-License-Identifier: GPL-3.0-or-later

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AgentPrivateToolsPort } from '../../../application/agentHost/runtimePorts.ts';
import type { AgentPrivateIpcServer } from './privateIpc.ts';

export function createPrivateAgentTools(ipc: AgentPrivateIpcServer): AgentPrivateToolsPort {
  return {
    async open({expiresAt, sessionId, tools, execute}) {
      const endpoint = await ipc.start();
      const capability = ipc.register({
        expiresAt, sessionId,
        handle: (request) => execute({arguments: request.tool.input, callId: request.id, name: request.tool.name}),
        listTools: () => tools.map(tool => ({...tool, inputSchema: {...tool.inputSchema}})),
      });
      const current = fileURLToPath(import.meta.url);
      return {capability, process: {
        arguments: [path.join(path.dirname(current), 'sessionMcpServer'+path.extname(current))],
        command: process.execPath,
        environment: { CTN_AGENT_IPC_ENDPOINT: endpoint, CTN_AGENT_SESSION_CAPABILITY: capability, CTN_AGENT_SESSION_ID: sessionId },
      }};
    },
    revoke: (capability) => ipc.revoke(capability),
    dispose: () => ipc.dispose(),
  };
}
