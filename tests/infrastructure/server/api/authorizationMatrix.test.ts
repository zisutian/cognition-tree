// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import type { ApiPrincipalDto } from "../../../../contracts/api/types.ts";
import {
  ownerAccess,
  publicAccess,
  readableAccess,
  syncAccess,
  type ApiAccessPolicy,
  type ApiOperationDefinition,
} from "../../../../contracts/api/operations/definition.ts";
import { assertOperationAccess } from "../../../../infrastructure/server/api/http/handlerContext.ts";

const principals = {
  automation: {
    id: "automation",
    kind: "automation",
    name: "Automation",
    repositoryIds: null,
    scopes: ["workspace:read"],
  },
  "local-owner": { id: "local-owner", kind: "local-owner", name: "Local" },
  owner: { id: "owner", kind: "owner", name: "Owner" },
  "trusted-client": {
    id: "trusted-client",
    kind: "trusted-client",
    name: "Trusted",
  },
} as const satisfies Record<string, ApiPrincipalDto>;

const policies = {
  "content-read-journal": readableAccess("journal"),
  "content-read-workspace": readableAccess("workspace"),
  "content-sync": syncAccess(),
  owner: ownerAccess(),
  public: publicAccess(),
} satisfies Record<string, ApiAccessPolicy>;

function operation(access: ApiAccessPolicy): ApiOperationDefinition {
  return {
    access,
    method: "GET",
    operationId: "matrix",
    path: "/matrix",
    responses: {},
  };
}

function outcome(
  principal: ApiPrincipalDto | null,
  access: ApiAccessPolicy,
) {
  try {
    assertOperationAccess(principal, operation(access));
    return "allow";
  } catch (error) {
    return error instanceof Error && "code" in error ? error.code : "error";
  }
}

describe("API authorization matrix", () => {
  it("handles every existing principal and access policy with default denial", () => {
    expect(Object.fromEntries(
      [
        ["null", null],
        ...Object.entries(principals),
      ].map(([principalName, principal]) => [
        principalName,
        Object.fromEntries(Object.entries(policies).map(([policyName, access]) => [
          policyName,
          outcome(principal as ApiPrincipalDto | null, access),
        ])),
      ]),
    )).toEqual({
      automation: {
        "content-read-journal": "forbidden",
        "content-read-workspace": "allow",
        "content-sync": "forbidden",
        owner: "forbidden",
        public: "allow",
      },
      "local-owner": {
        "content-read-journal": "allow",
        "content-read-workspace": "allow",
        "content-sync": "allow",
        owner: "allow",
        public: "allow",
      },
      null: {
        "content-read-journal": "unauthorized",
        "content-read-workspace": "unauthorized",
        "content-sync": "unauthorized",
        owner: "unauthorized",
        public: "allow",
      },
      owner: {
        "content-read-journal": "allow",
        "content-read-workspace": "allow",
        "content-sync": "allow",
        owner: "allow",
        public: "allow",
      },
      "trusted-client": {
        "content-read-journal": "allow",
        "content-read-workspace": "allow",
        "content-sync": "allow",
        owner: "forbidden",
        public: "allow",
      },
    });
  });
});
