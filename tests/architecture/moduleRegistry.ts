// SPDX-License-Identifier: GPL-3.0-or-later



// Reviewed module capabilities. Tests never infer allowed dependencies from current imports.
export type ModuleRegistration = {
  id: string;
  responsibility: string;
  scope: "directory" | "tree";
  publicEntries: readonly string[];
  rootFiles?: readonly string[];
  dependencies: readonly string[];
};

export const moduleRegistry: readonly ModuleRegistration[] = [
  {
    "id": "application/agent",
    "responsibility": "Browser Agent session, proposal approval, profile and scope application state",
    "scope": "tree",
    "publicEntries": [
      "application/agent/index.ts"
    ],
    "dependencies": [
      "application/commands",
      "application/persistence",
      "application/problems",
      "application/runtime",
      "core/ctn",
      "core/sync",
      "core/workspace"
    ]
  },
  {
    "id": "application/agentHost",
    "responsibility": "Server Agent sessions, staged domain commands, approval and Provider operation workflows through ports",
    "scope": "tree",
    "publicEntries": [
      "application/agentHost/index.ts"
    ],
    "dependencies": [
      "application/agent",
      "application/commands",
      "application/journal",
      "application/operations",
      "application/persistence",
      "application/runtime",
      "application/search",
      "application/todo",
      "application/workspace",
      "core/ctn",
      "core/journal",
      "core/sync",
      "core/todo"
    ]
  },
  {
    "id": "application/apiAccess",
    "responsibility": "Owner and automation access administration ports",
    "scope": "tree",
    "publicEntries": [
      "application/apiAccess/index.ts"
    ],
    "dependencies": []
  },
  {
    "id": "application/commands",
    "responsibility": "Domain command preparation, provenance and approved command execution contracts",
    "scope": "tree",
    "publicEntries": [
      "application/commands/index.ts"
    ],
    "dependencies": [
      "application/persistence",
      "core/ctn",
      "core/sync"
    ]
  },
  {
    "id": "application/journal",
    "responsibility": "Journal use cases, versioned sessions, persistence and conflict policy",
    "scope": "tree",
    "publicEntries": [
      "application/journal/index.ts"
    ],
    "dependencies": [
      "application/commands",
      "application/navigation",
      "application/persistence",
      "application/repository",
      "application/runtime",
      "core/ctn",
      "core/errors",
      "core/journal",
      "core/sync"
    ]
  },
  {
    "id": "application/navigation",
    "responsibility": "Cross-view navigation request contracts",
    "scope": "tree",
    "publicEntries": [
      "application/navigation/index.ts"
    ],
    "dependencies": []
  },
  {
    "id": "application/operations",
    "responsibility": "Operation receipt and ledger application ports",
    "scope": "tree",
    "publicEntries": [
      "application/operations/index.ts"
    ],
    "dependencies": [
      "application/agent"
    ]
  },
  {
    "id": "application/persistence",
    "responsibility": "Generic accepted snapshot, local-first coordination, save state machine and exact commit ports",
    "scope": "tree",
    "publicEntries": [
      "application/persistence/index.ts"
    ],
    "dependencies": [
      "application/runtime"
    ]
  },
  {
    "id": "application/problems",
    "responsibility": "Application problem projection and reporting",
    "scope": "tree",
    "publicEntries": [
      "application/problems/index.ts"
    ],
    "dependencies": [
      "application/runtime"
    ]
  },
  {
    "id": "application/repository",
    "responsibility": "Repository catalog use cases and selection state",
    "scope": "tree",
    "publicEntries": [
      "application/repository/index.ts"
    ],
    "dependencies": [
      "application/persistence",
      "core/naming"
    ]
  },
  {
    "id": "application/runtime",
    "responsibility": "Injected clock, scheduler and write admission barrier",
    "scope": "tree",
    "publicEntries": [
      "application/runtime/index.ts"
    ],
    "dependencies": []
  },
  {
    "id": "application/search",
    "responsibility": "Scoped search query coordination and result navigation",
    "scope": "tree",
    "publicEntries": [
      "application/search/index.ts"
    ],
    "dependencies": [
      "core/ctn"
    ]
  },
  {
    "id": "application/sync",
    "responsibility": "Snapshot synchronization coordination and revision event ordering",
    "scope": "tree",
    "publicEntries": [
      "application/sync/index.ts"
    ],
    "dependencies": [
      "application/commands",
      "application/persistence"
    ]
  },
  {
    "id": "application/syntax",
    "responsibility": "Syntax configuration sessions and draft persistence",
    "scope": "tree",
    "publicEntries": [
      "application/syntax/index.ts"
    ],
    "dependencies": [
      "application/problems",
      "core/ctn"
    ]
  },
  {
    "id": "application/system",
    "responsibility": "System settings and durable data-root migration state machine",
    "scope": "tree",
    "publicEntries": [
      "application/system/index.ts"
    ],
    "dependencies": []
  },
  {
    "id": "application/todo",
    "responsibility": "Todo use cases, local-date port, sessions and conflict policy",
    "scope": "tree",
    "publicEntries": [
      "application/todo/index.ts"
    ],
    "dependencies": [
      "application/commands",
      "application/persistence",
      "application/repository",
      "application/runtime",
      "core/ctn",
      "core/errors",
      "core/naming",
      "core/sync",
      "core/todo"
    ]
  },
  {
    "id": "application/workbench",
    "responsibility": "Content workbench coordination through domain application interfaces",
    "scope": "tree",
    "publicEntries": [
      "application/workbench/index.ts"
    ],
    "dependencies": [
      "application/journal",
      "application/navigation",
      "application/persistence",
      "application/problems",
      "application/repository",
      "application/runtime",
      "application/search",
      "application/sync",
      "application/syntax",
      "application/todo",
      "application/workspace",
      "core/ctn",
      "core/journal",
      "core/naming",
      "core/todo",
      "core/workspace"
    ]
  },
  {
    "id": "application/workspace",
    "responsibility": "Workspace commands, projections, versioned sessions and conflict policy",
    "scope": "tree",
    "publicEntries": [
      "application/workspace/index.ts"
    ],
    "dependencies": [
      "application/commands",
      "application/persistence",
      "application/problems",
      "application/repository",
      "application/runtime",
      "application/syntax",
      "core/ctn",
      "core/errors",
      "core/sync",
      "core/workspace"
    ]
  },
  {
    "id": "contracts/agent",
    "responsibility": "Agent wire schemas, decoders and model tool definitions",
    "scope": "tree",
    "publicEntries": [
      "contracts/agent/index.ts"
    ],
    "dependencies": [
      "contracts/common",
      "contracts/todo"
    ]
  },
  {
    "id": "contracts/api",
    "responsibility": "API v4 operation registry, route construction, permissions and wire decoders",
    "scope": "tree",
    "publicEntries": [
      "contracts/api/index.ts"
    ],
    "dependencies": [
      "contracts/agent",
      "contracts/built-ins",
      "contracts/common",
      "contracts/journal",
      "contracts/todo",
      "contracts/workspace"
    ]
  },
  {
    "id": "contracts/built-ins",
    "responsibility": "Built-in content catalog wire format",
    "scope": "tree",
    "publicEntries": [
      "contracts/built-ins/index.ts"
    ],
    "dependencies": [
      "contracts/common"
    ]
  },
  {
    "id": "contracts/common",
    "responsibility": "Domain-independent wire validation and schema primitives",
    "scope": "tree",
    "publicEntries": [
      "contracts/common/index.ts"
    ],
    "dependencies": []
  },
  {
    "id": "contracts/journal",
    "responsibility": "Journal v3 content wire format",
    "scope": "tree",
    "publicEntries": [
      "contracts/journal/index.ts"
    ],
    "dependencies": [
      "contracts/common"
    ]
  },
  {
    "id": "contracts/todo",
    "responsibility": "Todo v4 content wire format",
    "scope": "tree",
    "publicEntries": [
      "contracts/todo/index.ts"
    ],
    "dependencies": [
      "contracts/common"
    ]
  },
  {
    "id": "contracts/workspace",
    "responsibility": "Workspace v4 content wire format",
    "scope": "tree",
    "publicEntries": [
      "contracts/workspace/index.ts"
    ],
    "dependencies": [
      "contracts/common"
    ]
  },
  {
    "id": "core/ctn",
    "responsibility": "CTN syntax, parsing, semantic diagnostics and document operations",
    "scope": "tree",
    "publicEntries": [
      "core/ctn/index.ts"
    ],
    "dependencies": []
  },
  {
    "id": "core/errors",
    "responsibility": "Domain-independent diagnostic structure",
    "scope": "tree",
    "publicEntries": [
      "core/errors/index.ts"
    ],
    "dependencies": []
  },
  {
    "id": "core/journal",
    "responsibility": "Journal identity, local dates, sequence and content invariants",
    "scope": "tree",
    "publicEntries": [
      "core/journal/index.ts"
    ],
    "dependencies": [
      "core/ctn",
      "core/errors",
      "core/naming"
    ]
  },
  {
    "id": "core/naming",
    "responsibility": "Shared naming constraints",
    "scope": "tree",
    "publicEntries": [
      "core/naming/index.ts"
    ],
    "dependencies": []
  },
  {
    "id": "core/sync",
    "responsibility": "Pure three-way merge primitives and unresolved conflict units",
    "scope": "tree",
    "publicEntries": [
      "core/sync/index.ts"
    ],
    "dependencies": [
      "core/ctn"
    ]
  },
  {
    "id": "core/todo",
    "responsibility": "Todo task, recurrence and completion invariants",
    "scope": "tree",
    "publicEntries": [
      "core/todo/index.ts"
    ],
    "dependencies": [
      "core/ctn",
      "core/errors",
      "core/naming"
    ]
  },
  {
    "id": "core/workspace",
    "responsibility": "Workspace hierarchy, note identity and content invariants",
    "scope": "tree",
    "publicEntries": [
      "core/workspace/index.ts"
    ],
    "dependencies": [
      "core/ctn",
      "core/errors",
      "core/naming"
    ]
  },
  {
    "id": "infrastructure/client/http",
    "responsibility": "Browser HTTP and SSE transport with API registry codecs",
    "scope": "tree",
    "publicEntries": [
      "infrastructure/client/http/index.ts"
    ],
    "dependencies": [
      "application/agent",
      "application/apiAccess",
      "application/journal",
      "application/operations",
      "application/persistence",
      "application/repository",
      "application/sync",
      "application/system",
      "application/todo",
      "application/workspace",
      "contracts/agent",
      "contracts/api",
      "contracts/built-ins",
      "contracts/common",
      "contracts/journal",
      "contracts/todo",
      "contracts/workspace",
      "core/naming",
      "infrastructure/client/repository"
    ]
  },
  {
    "id": "infrastructure/client/platform",
    "responsibility": "Browser clock, scheduler, IDs, storage and platform adapters",
    "scope": "tree",
    "publicEntries": [
      "infrastructure/client/platform/index.ts"
    ],
    "dependencies": [
      "application/agent",
      "application/repository",
      "application/runtime",
      "application/todo"
    ]
  },
  {
    "id": "infrastructure/client/repository",
    "responsibility": "In-memory accepted snapshot cache adapters",
    "scope": "tree",
    "publicEntries": [
      "infrastructure/client/repository/index.ts"
    ],
    "dependencies": [
      "application/journal",
      "application/persistence",
      "application/repository",
      "application/todo",
      "application/workspace",
      "contracts/common",
      "contracts/journal",
      "contracts/todo",
      "contracts/workspace",
      "core/journal",
      "core/naming",
      "core/todo"
    ]
  },
  {
    "id": "infrastructure/client/runtime",
    "responsibility": "Browser application composition root",
    "scope": "tree",
    "publicEntries": [
      "infrastructure/client/runtime/index.ts"
    ],
    "dependencies": [
      "application/agent",
      "application/apiAccess",
      "application/journal",
      "application/operations",
      "application/problems",
      "application/repository",
      "application/system",
      "application/todo",
      "application/workbench",
      "application/workspace",
      "contracts/common",
      "infrastructure/client/http",
      "infrastructure/client/platform",
      "infrastructure/client/repository"
    ]
  },
  {
    "id": "infrastructure/server/access",
    "responsibility": "Persisted owner credentials, sessions and access tokens",
    "scope": "tree",
    "publicEntries": [
      "infrastructure/server/access/index.ts"
    ],
    "dependencies": [
      "contracts/api",
      "infrastructure/server/state"
    ]
  },
  {
    "id": "infrastructure/server/agent",
    "responsibility": "Model, network, child-process and persisted Agent configuration adapters",
    "scope": "tree",
    "publicEntries": [
      "infrastructure/server/agent/index.ts"
    ],
    "dependencies": [
      "application/agent",
      "application/agentHost",
      "application/commands",
      "application/persistence",
      "application/todo",
      "contracts/agent",
      "contracts/common",
      "infrastructure/server/network",
      "infrastructure/server/state"
    ]
  },
  {
    "id": "infrastructure/server/api/http",
    "responsibility": "HTTP authentication, routing, decoding, error mapping and event transport binding",
    "scope": "tree",
    "publicEntries": [
      "infrastructure/server/api/http/index.ts"
    ],
    "dependencies": [
      "application/agent",
      "application/agentHost",
      "application/commands",
      "application/journal",
      "application/operations",
      "application/persistence",
      "application/runtime",
      "application/sync",
      "application/system",
      "application/todo",
      "application/workspace",
      "contracts/agent",
      "contracts/api",
      "contracts/common",
      "contracts/workspace",
      "core/errors",
      "core/journal",
      "core/naming",
      "core/todo",
      "infrastructure/server/access",
      "infrastructure/server/agent",
      "infrastructure/server/api",
      "infrastructure/server/api/protocol",
      "infrastructure/server/api/resources",
      "infrastructure/server/api/sync",
      "infrastructure/server/network",
      "infrastructure/server/operations",
      "infrastructure/server/repository",
      "infrastructure/server/transport"
    ]
  },
  {
    "id": "infrastructure/server/api/protocol",
    "responsibility": "HTTP request error protocol primitives",
    "scope": "tree",
    "publicEntries": [
      "infrastructure/server/api/protocol/index.ts"
    ],
    "dependencies": [
      "contracts/api"
    ]
  },
  {
    "id": "infrastructure/server/api/resources",
    "responsibility": "Prepared content to wire resource projection",
    "scope": "tree",
    "publicEntries": [
      "infrastructure/server/api/resources/index.ts"
    ],
    "dependencies": [
      "application/journal",
      "application/todo",
      "application/workspace",
      "contracts/api",
      "contracts/common",
      "contracts/workspace",
      "core/ctn",
      "core/journal",
      "core/todo",
      "core/workspace"
    ]
  },
  {
    "id": "infrastructure/server/api",
    "responsibility": "Search HTTP result adapter",
    "scope": "directory",
    "publicEntries": [
      "infrastructure/server/api/index.ts"
    ],
    "dependencies": [
      "application/search",
      "application/workbench",
      "contracts/api",
      "contracts/common",
      "core/ctn",
      "core/journal",
      "core/todo",
      "core/workspace",
      "infrastructure/server/api/protocol",
      "infrastructure/server/api/resources",
      "infrastructure/server/repository"
    ]
  },
  {
    "id": "infrastructure/server/api/sync",
    "responsibility": "Wire synchronization adapter over application coordination",
    "scope": "tree",
    "publicEntries": [
      "infrastructure/server/api/sync/index.ts"
    ],
    "dependencies": [
      "application/commands",
      "application/journal",
      "application/persistence",
      "application/sync",
      "application/todo",
      "application/workspace",
      "contracts/api",
      "contracts/common",
      "contracts/journal",
      "contracts/todo",
      "contracts/workspace",
      "core/journal",
      "core/todo",
      "infrastructure/server/api/protocol",
      "infrastructure/server/repository",
      "infrastructure/server/transport"
    ]
  },
  {
    "id": "infrastructure/server/client",
    "responsibility": "Static client and development client middleware adapters",
    "scope": "tree",
    "publicEntries": [
      "infrastructure/server/client/index.ts"
    ],
    "dependencies": []
  },
  {
    "id": "infrastructure/server",
    "rootFiles": ["start.sh"],
    "responsibility": "Executable server startup and shutdown composition",
    "scope": "directory",
    "publicEntries": [],
    "dependencies": [
      "application/agentHost",
      "application/sync",
      "application/system",
      "infrastructure/server/access",
      "infrastructure/server/agent",
      "infrastructure/server/api/http",
      "infrastructure/server/api/sync",
      "infrastructure/server/client",
      "infrastructure/server/operations",
      "infrastructure/server/repository",
      "infrastructure/server/runtime",
      "infrastructure/server/system"
    ]
  },
  {
    "id": "infrastructure/server/network",
    "responsibility": "URL host normalization, address policy and DNS resolution",
    "scope": "tree",
    "publicEntries": [
      "infrastructure/server/network/index.ts"
    ],
    "dependencies": []
  },
  {
    "id": "infrastructure/server/operations",
    "responsibility": "Durable idempotency and operation ledger storage adapters",
    "scope": "tree",
    "publicEntries": [
      "infrastructure/server/operations/index.ts"
    ],
    "dependencies": [
      "application/operations",
      "application/persistence",
      "contracts/agent",
      "contracts/api",
      "infrastructure/server/state"
    ]
  },
  {
    "id": "infrastructure/server/persistence",
    "responsibility": "Filesystem storage, process locks and atomic writes",
    "scope": "tree",
    "publicEntries": [
      "infrastructure/server/persistence/index.ts"
    ],
    "dependencies": [
      "contracts/common"
    ]
  },
  {
    "id": "infrastructure/server/platform",
    "responsibility": "Node clock and application scheduler adapters",
    "scope": "tree",
    "publicEntries": [
      "infrastructure/server/platform/index.ts"
    ],
    "dependencies": [
      "application/runtime"
    ]
  },
  {
    "id": "infrastructure/server/repository",
    "responsibility": "Filesystem content stores, CAS and repository catalog adapters",
    "scope": "tree",
    "publicEntries": [
      "infrastructure/server/repository/index.ts"
    ],
    "dependencies": [
      "application/journal",
      "application/persistence",
      "application/todo",
      "application/workspace",
      "contracts/built-ins",
      "contracts/common",
      "contracts/journal",
      "contracts/todo",
      "contracts/workspace",
      "core/ctn",
      "core/journal",
      "core/naming",
      "core/todo",
      "core/workspace",
      "infrastructure/server/persistence"
    ]
  },
  {
    "id": "infrastructure/server/runtime",
    "responsibility": "Server service composition roots",
    "scope": "tree",
    "publicEntries": [
      "infrastructure/server/runtime/index.ts"
    ],
    "dependencies": [
      "application/runtime",
      "application/agentHost",
      "application/commands",
      "application/search",
      "application/sync",
      "contracts/common",
      "infrastructure/server/access",
      "infrastructure/server/agent",
      "infrastructure/server/api",
      "infrastructure/server/api/http",
      "infrastructure/server/api/resources",
      "infrastructure/server/api/sync",
      "infrastructure/server/operations",
      "infrastructure/server/platform",
      "infrastructure/server/repository"
    ]
  },
  {
    "id": "infrastructure/server/state",
    "responsibility": "Secure JSON transactions and commit-outcome reconciliation",
    "scope": "tree",
    "publicEntries": [
      "infrastructure/server/state/index.ts"
    ],
    "dependencies": [
      "application/persistence",
      "contracts/common",
      "infrastructure/server/persistence"
    ]
  },
  {
    "id": "infrastructure/server/system",
    "responsibility": "Bootstrap, migration record, directory ownership and startup recovery adapters",
    "scope": "tree",
    "publicEntries": [
      "infrastructure/server/system/index.ts"
    ],
    "dependencies": [
      "infrastructure/server/api/protocol",
      "application/system",
      "contracts/api",
      "contracts/common",
      "infrastructure/server/network",
      "infrastructure/server/persistence",
      "infrastructure/server/state"
    ]
  },
  {
    "id": "infrastructure/server/transport",
    "responsibility": "Server-sent event response transport",
    "scope": "tree",
    "publicEntries": [
      "infrastructure/server/transport/index.ts"
    ],
    "dependencies": []
  },
  {
    "id": "presentation/activities/agent",
    "responsibility": "Agent chat, scope, proposal and approval views",
    "scope": "tree",
    "publicEntries": [
      "presentation/activities/agent/index.ts"
    ],
    "dependencies": [
      "application/agent",
      "presentation/ui"
    ]
  },
  {
    "id": "presentation/activities/journal",
    "responsibility": "Journal activity views and React bindings",
    "scope": "tree",
    "publicEntries": [
      "presentation/activities/journal/index.ts"
    ],
    "dependencies": [
      "application/journal",
      "application/repository",
      "presentation/activities/unavailable",
      "presentation/editor",
      "presentation/ui"
    ]
  },
  {
    "id": "presentation/activities/notes",
    "responsibility": "Workspace note editing, graph and structure views",
    "scope": "tree",
    "publicEntries": [
      "presentation/activities/notes/index.ts"
    ],
    "dependencies": [
      "application/repository",
      "application/workspace",
      "core/ctn",
      "core/workspace",
      "presentation/activities/unavailable",
      "presentation/editor",
      "presentation/ui",
      "presentation/workspace"
    ]
  },
  {
    "id": "presentation/activities/repository",
    "responsibility": "Repository administration views",
    "scope": "tree",
    "publicEntries": [
      "presentation/activities/repository/index.ts"
    ],
    "dependencies": [
      "application/repository",
      "presentation/ui"
    ]
  },
  {
    "id": "presentation/activities/search",
    "responsibility": "Search input, results and navigation views",
    "scope": "tree",
    "publicEntries": [
      "presentation/activities/search/index.ts"
    ],
    "dependencies": [
      "application/navigation",
      "application/repository",
      "application/search",
      "application/workbench",
      "presentation/ui"
    ]
  },
  {
    "id": "presentation/activities/settings",
    "responsibility": "System, migration, Agent and access administration views",
    "scope": "tree",
    "publicEntries": [
      "presentation/activities/settings/index.ts"
    ],
    "dependencies": [
      "application/agent",
      "application/apiAccess",
      "application/operations",
      "application/system",
      "presentation/ui"
    ]
  },
  {
    "id": "presentation/activities/syntax",
    "responsibility": "Syntax configuration activity views",
    "scope": "tree",
    "publicEntries": [
      "presentation/activities/syntax/index.ts"
    ],
    "dependencies": [
      "application/journal",
      "application/syntax",
      "application/todo",
      "application/workbench",
      "presentation/syntax",
      "presentation/ui",
      "presentation/workspace"
    ]
  },
  {
    "id": "presentation/activities/todo",
    "responsibility": "Todo activity views and React bindings",
    "scope": "tree",
    "publicEntries": [
      "presentation/activities/todo/index.ts"
    ],
    "dependencies": [
      "application/repository",
      "application/todo",
      "core/todo",
      "presentation/activities/unavailable",
      "presentation/editor",
      "presentation/ui"
    ]
  },
  {
    "id": "presentation/activities/unavailable",
    "responsibility": "Unavailable activity placeholder projection",
    "scope": "tree",
    "publicEntries": [
      "presentation/activities/unavailable/index.ts"
    ],
    "dependencies": [
      "application/repository",
      "presentation/ui",
      "presentation/workspace"
    ]
  },
  {
    "id": "presentation/editor",
    "responsibility": "CodeMirror editor, composition, selection, undo and flush bindings",
    "scope": "tree",
    "publicEntries": [
      "presentation/editor/index.ts"
    ],
    "dependencies": [
      "core/ctn",
      "presentation/ui"
    ]
  },
  {
    "id": "presentation/shell",
    "rootFiles": ["index.html"],
    "responsibility": "React composition root, activity registry, session wiring and navigation shell",
    "scope": "tree",
    "publicEntries": [
      "presentation/shell/index.ts"
    ],
    "dependencies": [
      "application/agent",
      "application/apiAccess",
      "application/journal",
      "application/operations",
      "application/persistence",
      "application/problems",
      "application/repository",
      "application/runtime",
      "application/search",
      "application/syntax",
      "application/system",
      "application/todo",
      "application/workbench",
      "application/workspace",
      "core/journal",
      "core/todo",
      "infrastructure/client/http",
      "infrastructure/client/platform",
      "infrastructure/client/runtime",
      "presentation/activities/agent",
      "presentation/activities/journal",
      "presentation/activities/notes",
      "presentation/activities/repository",
      "presentation/activities/search",
      "presentation/activities/settings",
      "presentation/activities/syntax",
      "presentation/activities/todo",
      "presentation/ui",
      "presentation/workspace"
    ]
  },
  {
    "id": "presentation/syntax",
    "responsibility": "Shared syntax draft React bindings",
    "scope": "tree",
    "publicEntries": [
      "presentation/syntax/index.ts"
    ],
    "dependencies": [
      "application/syntax",
      "core/ctn"
    ]
  },
  {
    "id": "presentation/ui",
    "responsibility": "Domain-independent controls, layout, navigation descriptors and global styles",
    "scope": "tree",
    "publicEntries": [
      "presentation/ui/index.ts",
      "presentation/ui/styles/index.css"
    ],
    "dependencies": [
      "application/problems",
      "application/repository",
      "application/workbench",
      "core/ctn"
    ]
  },
  {
    "id": "presentation",
    "responsibility": "Browser environment declarations",
    "scope": "directory",
    "publicEntries": [],
    "dependencies": []
  },
  {
    "id": "presentation/workspace",
    "responsibility": "Workspace view state and reusable workspace editor projection",
    "scope": "tree",
    "publicEntries": [
      "presentation/workspace/index.ts"
    ],
    "dependencies": [
      "application/runtime",
      "application/syntax",
      "application/workspace",
      "core/ctn",
      "core/workspace",
      "presentation/syntax"
    ]
  },
  {
    "id": "tooling/benchmark",
    "responsibility": "Reproducible workspace capacity executable",
    "scope": "tree",
    "publicEntries": [],
    "dependencies": [
      "application/search",
      "application/workspace",
      "contracts/workspace",
      "core/ctn",
      "core/workspace",
      "infrastructure/client/http",
      "infrastructure/client/repository",
      "infrastructure/server/repository"
    ]
  },
  {
    "id": "tooling/build",
    "responsibility": "Build cleanup and bundle verification executables",
    "scope": "tree",
    "publicEntries": [],
    "dependencies": []
  },
  {
    "id": "tooling/cli",
    "rootFiles": ["ctn"],
    "responsibility": "Trusted-client command line protocol and local credential adapters",
    "scope": "tree",
    "publicEntries": [
      "tooling/cli/index.ts"
    ],
    "dependencies": [
      "contracts/api"
    ]
  },
  {
    "id": "tooling/config",
    "rootFiles": ["vite.config.ts", "playwright.config.ts", "tsconfig.json", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"],
    "responsibility": "Compiler and tool configuration",
    "scope": "tree",
    "publicEntries": [],
    "dependencies": []
  },
  {
    "id": "tooling/git",
    "rootFiles": [".githooks/pre-commit", ".githooks/commit-msg"],
    "responsibility": "Commit message validation executable",
    "scope": "tree",
    "publicEntries": [],
    "dependencies": []
  }
];
