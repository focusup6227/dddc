"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

type Tone = "success" | "error" | "info" | "warning";

export type ToastSpec = {
  /** Query param name to watch. */
  param: string;
  /** Sonner tone (default: success). */
  tone?: Tone;
  /** Static message. If omitted and no `format`, the param value is the message (handy for ?error=...). */
  message?: string;
  /** Computed message — gets the param value plus the full URLSearchParams. Return null to skip. */
  format?: (value: string, sp: URLSearchParams) => string | null;
  /** Only fire when the param's value equals this string. */
  whenValue?: string;
  /** Additional params to strip from the URL once this toast fires. */
  alsoStrip?: string[];
};

/**
 * Reads query params on mount, fires Sonner toasts for any matches, then
 * strips those params from the URL so navigation/refresh doesn't re-show them.
 *
 * Replaces the legacy ?saved=1 / ?error= banner pattern. Mount this near the
 * top of any page that previously rendered those banners.
 */
export function ToastNotifier({ toasts: specs }: { toasts: ToastSpec[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const pathname = usePathname();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    const toStrip = new Set<string>();
    for (const spec of specs) {
      const value = sp.get(spec.param);
      if (value == null || value === "") continue;
      if (spec.whenValue != null && value !== spec.whenValue) continue;

      let message: string | null = null;
      if (spec.format) {
        message = spec.format(value, sp);
      } else if (spec.message != null) {
        message = spec.message;
      } else {
        message = value;
      }
      if (!message) continue;

      const tone = spec.tone ?? "success";
      switch (tone) {
        case "error":
          toast.error(message);
          break;
        case "warning":
          toast.warning(message);
          break;
        case "info":
          toast.info(message);
          break;
        default:
          toast.success(message);
      }

      toStrip.add(spec.param);
      for (const extra of spec.alsoStrip ?? []) toStrip.add(extra);
    }

    if (toStrip.size > 0) {
      const next = new URLSearchParams(sp);
      for (const k of toStrip) next.delete(k);
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    }
  }, [sp, router, pathname, specs]);

  return null;
}
