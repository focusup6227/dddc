import { QUICK_ADD_BELONGINGS } from "@/lib/belongings.server";
import { kioskAddBelonging, kioskPrefillBelongings } from "../../actions";

/**
 * The add-item controls for the belongings checklist: a one-tap "prefill from
 * last visit" button, quick-add chips for the common items, and a free-text
 * fallback with quantity. Shared by the post-check-in step screen and the
 * booking detail page's manage section. `returnTo` (when set) keeps the caller
 * on its own page after each add instead of bouncing to the booking detail.
 */
export function BelongingsAdder({
  bookingId,
  prefillItems,
  returnTo,
}: {
  bookingId: string;
  prefillItems: { label: string; quantity: number }[];
  returnTo?: string;
}) {
  return (
    <div className="space-y-4">
      {prefillItems.length > 0 && (
        <form action={kioskPrefillBelongings}>
          <input type="hidden" name="booking_id" value={bookingId} />
          {returnTo && (
            <input type="hidden" name="return_to" value={returnTo} />
          )}
          <button
            type="submit"
            className="rounded-xl border border-stone-200/80 bg-white px-4 py-2 text-sm font-semibold text-ink-900 transition-colors hover:bg-cream-100"
          >
            ↺ Prefill from last visit ·{" "}
            {prefillItems.map((p) => p.label).join(", ")}
          </button>
        </form>
      )}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
          Add an item
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {QUICK_ADD_BELONGINGS.map((label) => (
            <form key={label} action={kioskAddBelonging}>
              <input type="hidden" name="booking_id" value={bookingId} />
              <input type="hidden" name="label" value={label} />
              {returnTo && (
                <input type="hidden" name="return_to" value={returnTo} />
              )}
              <button
                type="submit"
                className="rounded-full border border-stone-200/80 bg-white px-3.5 py-1.5 text-sm font-medium text-ink-800 transition-colors hover:bg-cream-100"
              >
                + {label}
              </button>
            </form>
          ))}
        </div>
        <form
          action={kioskAddBelonging}
          className="mt-4 flex flex-wrap items-end gap-3"
        >
          <input type="hidden" name="booking_id" value={bookingId} />
          {returnTo && (
            <input type="hidden" name="return_to" value={returnTo} />
          )}
          <label className="block min-w-[10rem] flex-1">
            <span className="label">Other item</span>
            <input
              type="text"
              name="label"
              placeholder="e.g. Probiotic powder"
              className="input"
              maxLength={80}
            />
          </label>
          <label className="block w-20">
            <span className="label">Qty</span>
            <input
              type="number"
              name="quantity"
              min={1}
              max={99}
              defaultValue={1}
              className="input"
            />
          </label>
          <button type="submit" className="btn-primary">
            Add
          </button>
        </form>
      </div>
    </div>
  );
}
