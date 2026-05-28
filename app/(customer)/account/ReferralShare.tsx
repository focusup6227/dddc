"use client";

import { useState } from "react";

export function ReferralShare({ code, url }: { code: string; url: string }) {
  const [copied, setCopied] = useState<"link" | "code" | null>(null);

  async function copy(value: string, which: "link" | "code") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // older Safari etc. — fall back silently
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded-md bg-stone-100 px-3 py-2 font-mono text-sm">
          {code}
        </code>
        <button
          type="button"
          onClick={() => copy(code, "code")}
          className="rounded-md border border-stone-300 px-3 py-2 text-sm font-medium text-ink-700 hover:bg-stone-50"
        >
          {copied === "code" ? "Copied" : "Copy code"}
        </button>
      </div>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded-md bg-stone-100 px-3 py-2 font-mono text-xs">
          {url}
        </code>
        <button
          type="button"
          onClick={() => copy(url, "link")}
          className="rounded-md border border-stone-300 px-3 py-2 text-sm font-medium text-ink-700 hover:bg-stone-50"
        >
          {copied === "link" ? "Copied" : "Copy link"}
        </button>
      </div>
    </div>
  );
}
