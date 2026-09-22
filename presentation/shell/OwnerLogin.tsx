// SPDX-License-Identifier: GPL-3.0-or-later

import {
  Button,
  EmptyState,
  FieldRow,
  FormActions,
  FormLayout,
  InputControl,
  Panel,
  Stack,
} from "compact-ui";

import { useState, type FormEvent } from "react";
import type {
  OwnerAuthenticationController,
  OwnerAuthenticationState,
} from "../../application/system/index.ts";
import { FormError, useExclusiveAsyncAction } from "../ui/index.ts";
import styles from "./OwnerLogin.module.css";

export function OwnerLogin({
  controller,
  state,
}: {
  controller: OwnerAuthenticationController;
  state: OwnerAuthenticationState;
}) {
  const [secret, setSecret] = useState("");
  const loginAction = useExclusiveAsyncAction();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const pending = loginAction.run(() => controller.login(secret));

    if (pending) void pending.catch(() => undefined);
  };

  if (
    state.status === "idle" ||
    (state.status === "loading" && !loginAction.busy)
  ) {
    return (
      <main className={styles.login} aria-busy="true">
        <EmptyState title="正在确认访问权限…" />
      </main>
    );
  }
  return (
    <main className={styles.login}>
      <div className={styles.content}>
        <Panel title="登录认知树" layout="form">
          <Stack>
            <FormError message={state.errorMessage} />
            <div aria-busy={loginAction.busy}>
              <FormLayout onSubmit={submit}>
                <FieldRow fieldId="owner-secret" label="所有者密钥">
                  {(accessibility) => (
                    <InputControl
                      {...accessibility}
                      autoComplete="current-password"
                      disabled={loginAction.busy}
                      onChange={(event) => setSecret(event.currentTarget.value)}
                      required
                      type="password"
                      value={secret}
                    />
                  )}
                </FieldRow>
                <FormActions>
                  <Button disabled={loginAction.busy} type="submit">
                    登录
                  </Button>
                </FormActions>
              </FormLayout>
            </div>
          </Stack>
        </Panel>
      </div>
    </main>
  );
}
