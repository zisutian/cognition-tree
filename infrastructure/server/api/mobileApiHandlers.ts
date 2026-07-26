// SPDX-License-Identifier: GPL-3.0-or-later

import {
  cognitionMobileContractVersion,
  type MobileBuiltInStatusDto,
  type MobileCapabilityStatusDto,
  type MobileJournalEntriesPageDto,
  type MobileJournalEntryDto,
  type MobileTodoCollectionDto,
  type MobileTodoCollectionsDto,
  type MobileTodoCompletionResultDto,
} from "../../../contracts/mobile/types.ts";
import type { BuiltInApiCatalog } from "./builtInApiHandlers.ts";
import {
  requireBuiltInCatalog,
  type MobileApiRoute,
  type MobileApiRuntime,
} from "./mobileApiCommon.ts";
import {
  handleMobileJournalApiRoute,
} from "./mobileJournalApiHandlers.ts";
import {
  handleMobileTodoApiRoute,
} from "./mobileTodoApiHandlers.ts";

async function mobileCapabilityStatus(
  builtInCatalog: BuiltInApiCatalog | undefined,
): Promise<MobileCapabilityStatusDto> {
  if (!builtInCatalog) {
    const fault: MobileBuiltInStatusDto = {
      message: "Built-in data catalog is unavailable",
      status: "fault",
    };

    return {
      capabilities: {
        journal: "read-only",
        todo: "completion-write",
      },
      contractVersion: cognitionMobileContractVersion,
      domains: { journal: fault, todo: fault },
    };
  }
  const catalog = await builtInCatalog.listBuiltIns();
  const projectStatus = (
    id: "journal" | "todo",
  ): MobileBuiltInStatusDto => {
    if (catalog.repositories.some(
      (repository) => repository.id === id,
    )) {
      return { status: "ready" };
    }
    const issue = catalog.issues.find(
      (candidate) => candidate.id === id,
    );

    return {
      ...(issue ? { message: issue.message } : {}),
      status: "fault",
    };
  };

  return {
    capabilities: {
      journal: "read-only",
      todo: "completion-write",
    },
    contractVersion: cognitionMobileContractVersion,
    domains: {
      journal: projectStatus("journal"),
      todo: projectStatus("todo"),
    },
  };
}

export async function handleMobileApiRoute({
  builtInCatalog,
  readJsonBody,
  route,
  runtime,
  url,
}: {
  builtInCatalog: BuiltInApiCatalog | undefined;
  readJsonBody(): Promise<unknown>;
  route: MobileApiRoute;
  runtime: MobileApiRuntime;
  url: URL;
}): Promise<{
  body:
    | MobileCapabilityStatusDto
    | MobileJournalEntriesPageDto
    | MobileJournalEntryDto
    | MobileTodoCollectionsDto
    | MobileTodoCollectionDto
    | MobileTodoCompletionResultDto;
  statusCode: number;
}> {
  if (route.kind === "mobile-status") {
    return {
      body: await mobileCapabilityStatus(builtInCatalog),
      statusCode: 200,
    };
  }
  const catalog = requireBuiltInCatalog(builtInCatalog);

  if (
    route.kind === "mobile-journal-entries" ||
    route.kind === "mobile-journal-entry"
  ) {
    return handleMobileJournalApiRoute({
      catalog,
      route,
      url,
    });
  }
  return handleMobileTodoApiRoute({
    catalog,
    readJsonBody,
    route,
    runtime,
  });
}
