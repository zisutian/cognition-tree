// SPDX-License-Identifier: GPL-3.0-or-later

import { useState, type FormEvent } from "react";
import type {
  OwnerAuthenticationController,
  OwnerAuthenticationState,
} from "../../application/system/index.ts";
import {
  Button,
  FieldRow,
  FormActions,
  FormError,
  FormLayout,
  InputControl,
  PageBody,
  useExclusiveAsyncAction,
} from "../ui/index.ts";
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
        正在确认访问权限…
      </main>
    );
  }
  return (
    <main className={styles.login}>
      <div className={styles.content}>
        <PageBody layout="form">
          <h1 className={styles.title}>登录认知树</h1>
          <FormError message={state.errorMessage} />
          <form aria-busy={loginAction.busy} onSubmit={submit}>
            <FormLayout layout="stacked">
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
                <Button
                  disabled={loginAction.busy}
                  type="submit"
                  variant="primary"
                >
                  登录
                </Button>
              </FormActions>
            </FormLayout>
          </form>
        </PageBody>
      </div>
    </main>
  );
}
