"use client";

import { useEffect, useState } from "react";
import {
  isSignalsBrowserExcluded,
  setSignalsBrowserExcluded,
} from "@/lib/signals/client";

export default function SignalsBrowserExclusion() {
  const [excluded, setExcluded] = useState(false);

  useEffect(() => {
    setExcluded(isSignalsBrowserExcluded());
  }, []);

  function toggle() {
    const next = !excluded;
    setSignalsBrowserExcluded(next);
    setExcluded(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={`rounded-lg border px-3 py-2 text-sm transition ${
        excluded
          ? "border-amber-500/70 text-amber-200 hover:border-amber-300"
          : "border-neutral-800 text-neutral-400 hover:border-neutral-600 hover:text-neutral-200"
      }`}
    >
      {excluded ? "This browser is excluded" : "Exclude this browser"}
    </button>
  );
}
