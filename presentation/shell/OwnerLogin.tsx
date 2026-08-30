// SPDX-License-Identifier: GPL-3.0-or-later

import { useState, type FormEvent } from "react";
import type {
  OwnerAuthenticationController,
  OwnerAuthenticationState,
} from "../../application/system";
import { Button } from "../ui/shared/primitives";
import { InputControl } from "../ui/shared/controls";
import { useExclusiveAsyncAction } from
  "../ui/shared/useExclusiveAsyncAction";
import "./ownerLogin.css";

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

  if (state.status === "idle" || state.status === "loading") {
    return <main className="owner-login" aria-busy="true">正在确认访问权限……</main>;
  }
  return (
    <main className="owner-login">
      <form className="owner-login-card" onSubmit={submit}>
        <h1>登录认知树</h1>
        <p>请输入由本机“设置 → 服务”创建的所有者密钥。</p>
        {state.errorMessage ? <p role="alert">{state.errorMessage}</p> : null}
        <label>
          <span>所有者密钥</span>
          <InputControl
            aria-label="所有者密钥"
            autoComplete="current-password"
            onChange={(event) => setSecret(event.currentTarget.value)}
            required
            type="password"
            value={secret}
          />
        </label>
        <Button disabled={loginAction.busy} type="submit" variant="primary">
          登录
        </Button>
      </form>
    </main>
  );
}
