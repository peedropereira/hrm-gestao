"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { loginAction } from "@/app/actions/account";
import { Button } from "@/components/button";

export function LoginForm({ voltar }: { voltar: string }) {
  const [state, action, pending] = useActionState(loginAction, undefined);
  const [show, setShow] = useState(false);
  const field = "h-12 w-full rounded-[12px] border border-line-strong bg-surface px-3.5 text-[16px] outline-none focus:border-ac focus:shadow-[0_0_0_4px_var(--ac-soft)]";

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="voltar" value={voltar} />
      <div className="grid gap-1.5">
        <label htmlFor="login" className="text-[15px] font-semibold">
          Usuário
        </label>
        <input id="login" name="login" key={state?.login ?? ""} defaultValue={state?.login ?? ""} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required className={field} />
      </div>
      <div className="grid gap-1.5">
        <label htmlFor="password" className="text-[15px] font-semibold">
          Senha
        </label>
        <div className="relative">
          <input id="password" name="password" type={show ? "text" : "password"} autoComplete="current-password" required className={`${field} pr-12`} />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-0.5 top-0.5 grid size-11 place-items-center rounded-[10px] text-fg-3 hover:text-fg"
            aria-label={show ? "Ocultar senha" : "Mostrar senha"}
          >
            {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
          </button>
        </div>
      </div>
      {state?.error && (
        <p role="alert" className="rounded-[12px] bg-red-bg px-4 py-3 text-[15px] font-medium text-red">
          {state.error}
        </p>
      )}
      <Button type="submit" block disabled={pending} className="mt-2">
        {pending && <Loader2 className="animate-spin" />}
        Entrar
      </Button>
    </form>
  );
}
