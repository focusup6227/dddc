"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { addIncidentPhoto, deleteIncidentPhoto } from "../actions";

const BUCKET = "incident-photos";

type DisplayPhoto = {
  id: string;
  storage_path: string;
  caption: string | null;
  signed_url: string | null;
};

export function IncidentPhotosEditor({
  incidentId,
  photos,
}: {
  incidentId: string;
  photos: DisplayPhoto[];
}) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [pending, startTransition] = useTransition();

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const key = `${incidentId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(key, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;

      const payload = new FormData();
      payload.set("incident_id", incidentId);
      payload.set("storage_path", key);
      payload.set("caption", caption);

      await addIncidentPhoto(payload);
      setCaption("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <section className="card">
      <h2 className="font-semibold text-stone-900">Photos</h2>
      <p className="mt-1 text-xs text-stone-500">
        Private — only staff can see these. Useful for documenting injuries,
        fence damage, etc.
      </p>

      <div className="mt-4 rounded-md border border-stone-200 bg-stone-50 p-3 space-y-3">
        <div>
          <label className="label" htmlFor="ic-caption">
            Caption (optional)
          </label>
          <input
            id="ic-caption"
            type="text"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Bite on left ear"
            className="input"
            disabled={uploading}
          />
        </div>
        <div>
          <label className="label" htmlFor="ic-file">
            Choose a photo to upload
          </label>
          <input
            id="ic-file"
            type="file"
            accept="image/*"
            onChange={onFileChange}
            disabled={uploading}
            className="block text-sm"
          />
          {uploading && <p className="mt-1 text-xs text-stone-500">Uploading…</p>}
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </div>
      </div>

      {photos.length === 0 ? (
        <p className="mt-4 text-stone-600">No photos yet.</p>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((p) => (
            <li
              key={p.id}
              className="overflow-hidden rounded-lg border border-stone-200 bg-white"
            >
              {p.signed_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={p.signed_url}
                  alt={p.caption ?? "Incident photo"}
                  className="aspect-square w-full object-cover"
                />
              ) : (
                <div className="aspect-square w-full bg-stone-100 text-xs text-stone-500 flex items-center justify-center">
                  Unavailable
                </div>
              )}
              <div className="space-y-1 p-2">
                {p.caption && (
                  <p className="text-sm text-stone-800">{p.caption}</p>
                )}
                <form
                  action={(fd) =>
                    startTransition(async () => {
                      await deleteIncidentPhoto(fd);
                      router.refresh();
                    })
                  }
                >
                  <input type="hidden" name="incident_id" value={incidentId} />
                  <input type="hidden" name="photo_id" value={p.id} />
                  <input
                    type="hidden"
                    name="storage_path"
                    value={p.storage_path}
                  />
                  <button
                    type="submit"
                    disabled={pending}
                    className="text-xs font-medium text-stone-500 hover:text-red-600"
                  >
                    Remove
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
