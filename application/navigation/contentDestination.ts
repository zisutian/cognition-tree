// SPDX-License-Identifier: GPL-3.0-or-later

type ContentDestinationBase = {
  blockId: string | null;
  resourceId: string;
};

export type ContentDestination =
  | (ContentDestinationBase & {
      domain: "workspace";
      repositoryId: string;
    })
  | (ContentDestinationBase & {
      domain: "journal" | "todo";
      repositoryId?: never;
    });

export type WorkspaceContentDestination = Extract<
  ContentDestination,
  { domain: "workspace" }
>;

export type ContentDestinationOption = ContentDestination & {
  description: string;
  id: string;
  label: string;
};

export type ContentOpenOutcome = {
  domain: ContentDestination["domain"];
  status: "opened" | "stale" | "unavailable";
};
