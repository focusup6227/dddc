"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import type { Belonging } from "@/lib/supabase/types";
import {
  liveAddBelonging,
  livePrefillBelongings,
  liveRemoveBelonging,
  liveReturnAllBelongings,
  liveSetBelongingQuantity,
  liveSetBelongingReturned,
} from "../../actions";

/**
 * Client-side belongings checklist. Every change updates the list optimistically
 * and calls a redirect-free server action that returns the fresh list — so
 * adding an item feels instant and never reloads the page (the old per-add form
 * submit did a full server round-trip each time). Quantities are adjusted inline
 * with a +/- stepper on each item.
 *
 * `showReturns` adds the pickup workflow (Returned/Undo + Return all) used on the
 * booking detail page; the post-check-in drop-off step omits it.
 */
export function BelongingsManager({
  bookingId,
  initialItems,
  prefillItems,
  quickAdd,
  canEdit = true,
  showReturns = false,
}: {
  bookingId: string;
  initialItems: Belonging[];
  prefillItems: { label: string; quantity: number }[];
  quickAdd: string[];
  canEdit?: boolean;
  showReturns?: boolean;
}) {
  const [items, setItems] = useState<Belonging[]>(initialItems);
  const [optimistic, applyOptimistic] = useOptimistic(
    items,
    (state: Belonging[], action: OptimisticAction): Belonging[] => {
      switch (action.type) {
        case "add":
          return [...state, action.item];
        case "remove":
          return state.filter((b) => b.id !== action.id);
        case "qty":
          return state.map((b) =>
            b.id === action.id ? { ...b, quantity: action.quantity } : b,
          );
        case "returned":
          return state.map((b) =>
            b.id === action.id
              ? {
                  ...b,
                  returned_at: action.returned ? new Date().toISOString() : null,
                }
              : b,
          );
        case "returnAll":
          return state.map((b) =>
            b.returned_at ? b : { ...b, returned_at: new Date().toISOString() },
          );
      }
    },
  );
  const [pending, startTransition] = useTransition();
  const [otherLabel, setOtherLabel] = useState("");
  const [otherQty, setOtherQty] = useState(1);
  const tmpId = useRef(0);

  function run(
    optimisticAction: OptimisticAction,
    serverCall: () => Promise<Belonging[]>,
  ) {
    startTransition(async () => {
      applyOptimistic(optimisticAction);
      const fresh = await serverCall();
      setItems(fresh);
    });
  }

  function addItem(label: string, quantity: number) {
    const trimmed = label.trim();
    if (!trimmed) return;
    // Re-adding something already on the list bumps its count instead of adding
    // a second row (matches the server's merge-by-label behavior).
    const existing = optimistic.find(
      (b) => !b.returned_at && b.label.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (existing) {
      run(
        {
          type: "qty",
          id: existing.id,
          quantity: Math.min(99, existing.quantity + quantity),
        },
        () => liveAddBelonging({ bookingId, label: trimmed, quantity }),
      );
      return;
    }
    const id = `tmp-${tmpId.current++}`;
    run(
      { type: "add", item: tempBelonging(id, bookingId, trimmed, quantity) },
      () => liveAddBelonging({ bookingId, label: trimmed, quantity }),
    );
  }

  function prefill() {
    startTransition(async () => {
      // Show the prefilled items instantly, then settle to the server's list.
      for (const p of prefillItems) {
        applyOptimistic({
          type: "add",
          item: tempBelonging(
            `tmp-${tmpId.current++}`,
            bookingId,
            p.label,
            p.quantity,
          ),
        });
      }
      const fresh = await livePrefillBelongings({ bookingId });
      setItems(fresh);
    });
  }

  const outstanding = optimistic.filter((b) => !b.returned_at);
  const returned = optimistic.filter((b) => b.returned_at);
  const ordered = showReturns ? [...outstanding, ...returned] : optimistic;

  return (
    <div className={pending ? "opacity-95 transition-opacity" : ""}>
      {/* List */}
      {ordered.length === 0 ? (
        <p className="text-sm text-ink-500">Nothing logged yet.</p>
      ) : (
        <ul className="divide-y divide-stone-200/80">
          {ordered.map((b) => {
            const isReturned = !!b.returned_at;
            return (
              <li
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p
                    className={`font-medium ${isReturned ? "text-ink-400 line-through" : "text-ink-900"}`}
                  >
                    {b.label}
                  </p>
                  {b.notes && <p className="text-xs text-ink-500">{b.notes}</p>}
                  {isReturned && (
                    <p className="text-xs text-emerald-700">Returned ✓</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {canEdit && !isReturned ? (
                    <QtyStepper
                      value={b.quantity}
                      onChange={(q) =>
                        run({ type: "qty", id: b.id, quantity: q }, () =>
                          liveSetBelongingQuantity({
                            bookingId,
                            id: b.id,
                            quantity: q,
                          }),
                        )
                      }
                    />
                  ) : (
                    b.quantity > 1 && (
                      <span className="text-ink-500">× {b.quantity}</span>
                    )
                  )}
                  {canEdit && showReturns && (
                    <button
                      type="button"
                      onClick={() =>
                        run({ type: "returned", id: b.id, returned: !isReturned }, () =>
                          liveSetBelongingReturned({
                            bookingId,
                            id: b.id,
                            returned: !isReturned,
                          }),
                        )
                      }
                      className={
                        isReturned
                          ? "rounded-lg border border-stone-200 px-3 py-1.5 text-sm font-semibold text-ink-600 transition-colors hover:bg-cream-50"
                          : "rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
                      }
                    >
                      {isReturned ? "Undo" : "Returned"}
                    </button>
                  )}
                  {canEdit && (
                    <button
                      type="button"
                      aria-label={`Remove ${b.label}`}
                      onClick={() =>
                        run({ type: "remove", id: b.id }, () =>
                          liveRemoveBelonging({ bookingId, id: b.id }),
                        )
                      }
                      className="rounded-lg border border-stone-200 px-2.5 py-1.5 text-sm font-semibold text-ink-500 transition-colors hover:bg-red-50 hover:text-red-700"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {canEdit && showReturns && outstanding.length > 1 && (
        <button
          type="button"
          onClick={() =>
            run({ type: "returnAll" }, () => liveReturnAllBelongings({ bookingId }))
          }
          className="mt-3 w-full rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white shadow-soft transition-all hover:bg-emerald-700 active:translate-y-px"
        >
          Return all {outstanding.length}
        </button>
      )}

      {/* Add controls */}
      {canEdit && (
        <div className="mt-4 space-y-4">
          {prefillItems.length > 0 && optimistic.length === 0 && (
            <button
              type="button"
              onClick={prefill}
              className="rounded-xl border border-stone-200/80 bg-white px-4 py-2 text-sm font-semibold text-ink-900 transition-colors hover:bg-cream-100"
            >
              ↺ Prefill from last visit ·{" "}
              {prefillItems.map((p) => p.label).join(", ")}
            </button>
          )}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
              Add an item
            </p>
            <p className="mt-0.5 text-xs text-ink-400">
              Tap to add — then set the quantity on the item.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {quickAdd.map((label) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => addItem(label, 1)}
                  className="rounded-full border border-stone-200/80 bg-white px-3.5 py-1.5 text-sm font-medium text-ink-800 transition-colors hover:bg-cream-100"
                >
                  + {label}
                </button>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <label className="block min-w-[10rem] flex-1">
                <span className="label">Other item</span>
                <input
                  type="text"
                  value={otherLabel}
                  onChange={(e) => setOtherLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addItem(otherLabel, otherQty);
                      setOtherLabel("");
                      setOtherQty(1);
                    }
                  }}
                  placeholder="e.g. Probiotic powder"
                  className="input"
                  maxLength={80}
                />
              </label>
              <div>
                <span className="label">Qty</span>
                <QtyStepper value={otherQty} onChange={setOtherQty} />
              </div>
              <button
                type="button"
                onClick={() => {
                  addItem(otherLabel, otherQty);
                  setOtherLabel("");
                  setOtherQty(1);
                }}
                className="btn-primary"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function QtyStepper({
  value,
  onChange,
}: {
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="flex items-center rounded-lg border border-stone-200 bg-white">
      <button
        type="button"
        aria-label="Decrease quantity"
        onClick={() => onChange(Math.max(1, value - 1))}
        className="px-2.5 py-1.5 text-ink-600 hover:bg-cream-50 disabled:opacity-40"
        disabled={value <= 1}
      >
        −
      </button>
      <span className="min-w-[1.75rem] text-center text-sm font-semibold text-ink-900">
        {value}
      </span>
      <button
        type="button"
        aria-label="Increase quantity"
        onClick={() => onChange(Math.min(99, value + 1))}
        className="px-2.5 py-1.5 text-ink-600 hover:bg-cream-50"
      >
        +
      </button>
    </div>
  );
}

function tempBelonging(
  id: string,
  bookingId: string,
  label: string,
  quantity: number,
): Belonging {
  return {
    id,
    booking_id: bookingId,
    dog_id: "",
    customer_id: "",
    label,
    quantity,
    notes: null,
    checked_in_at: new Date().toISOString(),
    checked_in_by: null,
    returned_at: null,
    returned_by: null,
    created_at: new Date().toISOString(),
  };
}

type OptimisticAction =
  | { type: "add"; item: Belonging }
  | { type: "remove"; id: string }
  | { type: "qty"; id: string; quantity: number }
  | { type: "returned"; id: string; returned: boolean }
  | { type: "returnAll" };
