import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildSyntaxProfileDraft,
  createSyntaxProfileDraft,
  type SyntaxProfileDraft,
} from "../../../../../ctn/syntax/profileDraft";
import {
  syntaxProfileValidationPolicies,
  type CtnSyntaxProfileValidationPolicy,
} from "../../../../../ctn/syntax/profileSchema";
import { formatSyntaxProfileToml } from "../../../../../ctn/syntax/profileToml";
import type { CtnSyntaxProfile } from "../../../../../ctn/syntax/types";
import { isCurrentSyntaxPersistenceCompletion } from "../../runtime/useSyntaxRuntime";

export type SystemSyntaxOwner = "journal" | "todo";

export type SystemSyntaxSource = {
  profile: CtnSyntaxProfile;
  source: string;
  updateSource: (source: string) => void | Promise<void>;
};

function policyForOwner(owner: SystemSyntaxOwner): CtnSyntaxProfileValidationPolicy {
  return owner === "journal"
    ? syntaxProfileValidationPolicies.journal
    : syntaxProfileValidationPolicies.todo;
}

function createSource(
  draft: SyntaxProfileDraft,
  policy: CtnSyntaxProfileValidationPolicy,
) {
  const result = buildSyntaxProfileDraft(draft, policy);

  return {
    result,
    source: result.profile
      ? formatSyntaxProfileToml(result.profile, policy)
      : null,
  };
}

export function useSystemSyntaxRuntime({
  owner,
  syntax,
}: {
  owner: SystemSyntaxOwner;
  syntax: SystemSyntaxSource | null;
}) {
  const policy = policyForOwner(owner);
  const [draft, setDraft] = useState<SyntaxProfileDraft | null>(() =>
    syntax ? createSyntaxProfileDraft(syntax.profile) : null
  );
  const editVersionRef = useRef(0);
  const latestSourceRef = useRef<string | null>(syntax?.source ?? null);
  const lastPersistedSourceRef = useRef(syntax?.source ?? "");
  const updateSourceRef = useRef(syntax?.updateSource ?? null);
  const mountedRef = useRef(false);
  updateSourceRef.current = syntax?.updateSource ?? null;
  const draftBuild = useMemo(
    () => draft ? createSource(draft, policy) : null,
    [draft, policy],
  );
  latestSourceRef.current = draftBuild?.source ?? null;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!syntax) {
      setDraft(null);
      lastPersistedSourceRef.current = "";
      latestSourceRef.current = null;
      return;
    }
    const currentSource = draft ? createSource(draft, policy).source : null;

    if (!draft || currentSource === lastPersistedSourceRef.current) {
      editVersionRef.current += 1;
      setDraft(createSyntaxProfileDraft(syntax.profile));
      latestSourceRef.current = syntax.source;
    }
    lastPersistedSourceRef.current = syntax.source;
  }, [policy, syntax?.profile, syntax?.source]);

  const updateDraft = useCallback((nextDraft: SyntaxProfileDraft) => {
    editVersionRef.current += 1;
    const version = editVersionRef.current;
    const persistence = createSource(nextDraft, policy);

    setDraft(nextDraft);
    latestSourceRef.current = persistence.source;
    if (
      !persistence.source ||
      persistence.source === lastPersistedSourceRef.current ||
      !updateSourceRef.current
    ) {
      return;
    }
    const source = persistence.source;
    let completion: Promise<void>;

    try {
      completion = Promise.resolve(updateSourceRef.current(source));
    } catch {
      return;
    }
    void completion.then(() => {
      if (isCurrentSyntaxPersistenceCompletion({
        active: mountedRef.current,
        completedFileId: owner,
        completedSource: source,
        completedVersion: version,
        currentFileId: owner,
        currentSource: latestSourceRef.current,
        currentVersion: editVersionRef.current,
      })) {
        lastPersistedSourceRef.current = source;
      }
    }).catch(() => undefined);
  }, [owner, policy]);

  const revertDraft = useCallback(() => {
    if (!syntax) {
      return;
    }
    editVersionRef.current += 1;
    lastPersistedSourceRef.current = syntax.source;
    latestSourceRef.current = syntax.source;
    setDraft(createSyntaxProfileDraft(syntax.profile));
  }, [syntax]);

  return {
    available: syntax !== null,
    draft,
    draftResult: draftBuild?.result ?? null,
    hasDraftErrors: Boolean(draftBuild && !draftBuild.result.profile),
    owner,
    policy,
    revertDraft,
    updateDraft,
  };
}

export type SystemSyntaxRuntime = ReturnType<typeof useSystemSyntaxRuntime>;
