"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { reportCardPhotoPublicUrl } from "@/lib/dogPhoto";
import { formatDateShort } from "@/lib/format";
import type { ReportCardPhoto } from "@/lib/supabase/types";
import { addReportCardPhoto, deleteReportCardPhoto } from "../actions";

const BUCKET = "report-card-photos";

export function ReportCardPhotosEditor({
  bookingId,
  photos,
}: {
  bookingId: string;
  photos: ReportCardPhoto[];
}) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [photoDate, setPhotoDate] = useState("");
  const [pending, startTransition] = useTransition();

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const key = `${bookingId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(key, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;

      const payload = new FormData();
      payload.set("booking_id", bookingId);
      payload.set("storage_path", key);
      payload.set("caption", caption);
      payload.set("photo_date", photoDate);

      await addReportCardPhoto(payload);
      setCaption("");
      setPhotoDate("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      // Allow re-selecting the same file.
      e.target.value = "";
    }
  }

  return (
    <section className="card">
      <h2 className="font-semibold text-ink-900">Photos</h2>
      <p className="mt-1 text-xs text-ink-500">
        Add a photo at a time. Optional caption + date — both show up on the
        customer&apos;s card.
      </p>

      <div className="mt-4 rounded-md border border-stone-200 bg-cream-50 p-3 space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="rc-caption">
              Caption (optional)
            </label>
            <input
              id="rc-caption"
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Snack time!"
              className="input"
              disabled={uploading}
            />
          </div>
          <div>
            <label className="label" htmlFor="rc-date">
              Date (optional)
            </label>
            <input
              id="rc-date"
              type="date"
              value={photoDate}
              onChange={(e) => setPhotoDate(e.target.value)}
              className="input"
              disabled={uploading}
            />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="rc-file">
            Choose a photo to upload
          </label>
          <input
            id="rc-file"
            type="file"
            accept="image/*"
            onChange={onFileChange}
            disabled={uploading}
            className="block text-sm"
          />
          {uploading && (
            <p className="mt-1 text-xs text-ink-500">Uploading…</p>
          )}
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </div>
      </div>

      {photos.length === 0 ? (
        <p className="mt-4 text-ink-700">No photos yet.</p>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((p) => {
            const url = reportCardPhotoPublicUrl(
              process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
              p.storage_path,
            );
            return (
              <li
                key={p.id}
                className="overflow-hidden rounded-lg border border-stone-200 bg-white"
              >
                {url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={url}
                    alt={p.caption ?? "Report card photo"}
                    className="aspect-square w-full object-cover"
                  />
                )}
                <div className="space-y-1 p-2">
                  {p.caption && (
                    <p className="text-sm text-ink-900">{p.caption}</p>
                  )}
                  {p.photo_date && (
                    <p className="text-xs text-ink-500">
                      {formatDateShort(p.photo_date)}
                    </p>
                  )}
                  <form
                    action={(fd) =>
                      startTransition(async () => {
                        await deleteReportCardPhoto(fd);
                        router.refresh();
                      })
                    }
                  >
                    <input type="hidden" name="booking_id" value={bookingId} />
                    <input type="hidden" name="photo_id" value={p.id} />
                    <input
                      type="hidden"
                      name="storage_path"
                      value={p.storage_path}
                    />
                    <button
                      type="submit"
                      disabled={pending}
                      className="text-xs font-medium text-ink-500 hover:text-red-600"
                    >
                      Remove
                    </button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
