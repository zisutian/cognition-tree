// SPDX-License-Identifier: GPL-3.0-or-later

import type { OutgoingHttpHeaders, ServerResponse } from 'node:http';
import type { AgentEventSink } from '../../../../application/agentHost/index.ts';
import { serializeJsonIteratively } from '../../../../contracts/common/index.ts';
import { writeServerSentEvent, endServerSentEventResponse } from '../../transport/index.ts';

export function createAgentEventSink(response: ServerResponse, headers: OutgoingHttpHeaders): AgentEventSink {
  return {
    open: () => { response.writeHead(200, {...headers, 'Cache-Control': 'no-store', 'Content-Type': 'text/event-stream; charset=utf-8', Connection: 'keep-alive', 'X-Accel-Buffering': 'no'}); },
    onClose: (listener) => { response.once('close', listener); },
    send: (event) => writeServerSentEvent(response, `event: ${event.type}\nid: ${event.sequence}\ndata: ${serializeJsonIteratively(event, { sortObjectKeys: true })}\n\n`),
    close: () => { endServerSentEventResponse(response); },
  };
}
