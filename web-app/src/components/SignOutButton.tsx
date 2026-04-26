"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="w-full text-left px-2 py-1 text-slate-300 hover:text-white"
    >
      ログアウト
    </button>
  );
}
