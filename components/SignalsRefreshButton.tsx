"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export default function SignalsRefreshButton() {
  const router = useRouter();
  const [hasRefreshed, setHasRefreshed] = useState(false);
  const [isRefreshing, startTransition] = useTransition();

  function refresh() {
    setHasRefreshed(true);
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={refresh}
        disabled={isRefreshing}
        className="rounded-lg border border-neutral-800 px-3 py-2 text-sm text-neutral-300 transition hover:border-[#C6A75A] hover:text-[#E7CD8D]"
      >
        {isRefreshing ? "Refreshing…" : "Refresh"}
      </button>
      {isRefreshing || hasRefreshed ? <span className="text-xs text-neutral-500" aria-live="polite">{isRefreshing ? "Updating…" : "Updated just now"}</span> : null}
    </div>
  );
}
