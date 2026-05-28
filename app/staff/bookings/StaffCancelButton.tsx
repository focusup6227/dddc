"use client";

import { useState } from "react";
import { staffCancelBooking } from "../actions";

export default function StaffCancelButton({
  bookingId,
  preview,
}: {
  bookingId: string;
  preview: string;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-secondary text-xs"
      >
        Cancel
      </button>
    );
  }

  return (
    <form action={staffCancelBooking} className="flex flex-col items-end gap-1">
      <input type="hidden" name="booking_id" value={bookingId} />
      <p className="text-xs text-stone-600">{preview}</p>
      <input
        type="text"
        name="reason"
        placeholder="Reason (optional)"
        className="input text-xs"
      />
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="btn-secondary text-xs"
        >
          Keep
        </button>
        <button
          type="submit"
          className="btn-primary text-xs"
          onClick={(e) => {
            if (!confirm(`Cancel this booking?\n\n${preview}`)) {
              e.preventDefault();
            }
          }}
        >
          Confirm cancel
        </button>
      </div>
    </form>
  );
}
