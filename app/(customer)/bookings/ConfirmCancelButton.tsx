"use client";

export default function ConfirmCancelButton({ preview }: { preview: string }) {
  return (
    <button
      type="submit"
      className="btn-secondary text-sm"
      onClick={(e) => {
        if (!confirm(`Cancel this booking?\n\n${preview}`)) {
          e.preventDefault();
        }
      }}
    >
      Cancel
    </button>
  );
}
