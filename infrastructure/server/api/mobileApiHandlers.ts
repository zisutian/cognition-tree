// SPDX-License-Identifier: GPL-3.0-or-later

import {
  cognitionMobileContractVersion,
  cognitionMobileV2ContractVersion,
  type MobileBuiltInStatusDto,
  type MobileCapabilityStatusDto,
  type MobileJournalEntriesPageDto,
  type MobileJournalEntryDto,
  type MobileTodoCollectionDto,
  type MobileTodoCollectionsDto,
  type MobileTodoCompletionResultDto,
  type MobileV2CapabilityStatusDto,
  type MobileV2JournalEntriesPageDto,
  type MobileV2JournalEntryDto,
  type MobileV2TodoCollectionDto,
  type MobileV2TodoCollectionsDto,
  type MobileV2TodoCompletionResultDto,
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
import {
  isMobileV2ApiRoute,
  mapMobileV2ApiError,
  requireBuiltInCatalogV2,
} from "./mobileV2ApiCommon.ts";
import {
  handleMobileV2JournalApiRoute,
} from "./mobileV2JournalApiHandlers.ts";
import {
  handleMobileV2TodoApiRoute,
} from "./mobileV2TodoApiHandlers.ts";

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

async function mobileV2CapabilityStatus(
  builtInCatalog: BuiltInApiCatalog | undefined,
): Promise<MobileV2CapabilityStatusDto> {
  const current = await mobileCapabilityStatus(builtInCatalog);

  return {
    ...current,
    contractVersion: cognitionMobileV2ContractVersion,
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
    | MobileTodoCompletionResultDto
    | MobileV2CapabilityStatusDto
    | MobileV2JournalEntriesPageDto
    | MobileV2JournalEntryDto
    | MobileV2TodoCollectionsDto
    | MobileV2TodoCollectionDto
    | MobileV2TodoCompletionResultDto;
  statusCode: number;
}> {
  if (isMobileV2ApiRoute(route)) {
    try {
      if (route.kind === "mobile-v2-status") {
        return {
          body: await mobileV2CapabilityStatus(builtInCatalog),
          statusCode: 200,
        };
      }
      const catalog = requireBuiltInCatalogV2(builtInCatalog);

      if (
        route.kind === "mobile-v2-journal-entries" ||
        route.kind === "mobile-v2-journal-entry"
      ) {
        return await handleMobileV2JournalApiRoute({
          catalog,
          route,
          url,
        });
      }
      return await handleMobileV2TodoApiRoute({
        catalog,
        readJsonBody,
        route,
        runtime,
      });
    } catch (error) {
      throw mapMobileV2ApiError(error);
    }
  }
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
