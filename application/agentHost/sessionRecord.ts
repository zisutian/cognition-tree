// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  AgentRuntimePort,
  AgentRuntimeSession,
  AgentSessionController,
  AgentSyntaxKnowledge,
} from "../agent/index.ts";
import type { AgentConfigurationProfileUse } from "./configurationAccess.ts";
import type { ResolvedAgentConfiguration } from "./configurationPort.ts";
import type { AgentRuntimeProfile } from "./runtimeProfiles.ts";
import type { AgentSessionEventStream } from "./sessionEventStream.ts";
import type { AgentStaging } from "./sessionToolState.ts";

export type AgentSessionRecord = {
  abortController: AbortController | null;
  capability: string | null;
  controller: AgentSessionController;
  disposePromise: Promise<void> | null;
  events: AgentSessionEventStream;
  configuration: ResolvedAgentConfiguration;
  configurationUse: AgentConfigurationProfileUse;
  profile: AgentRuntimeProfile;
  runtime: AgentRuntimePort;
  runtimeSession: AgentRuntimeSession;
  runtimeStopPromise: Promise<void> | null;
  staging: AgentStaging | null;
  syntaxKnowledge: AgentSyntaxKnowledge | null;
};
