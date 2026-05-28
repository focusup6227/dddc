import { reportCardPhotoPublicUrl } from "@/lib/dogPhoto";
import { formatDate, formatDateShort } from "@/lib/format";
import type { ReportCard, ReportCardPhoto } from "@/lib/supabase/types";

export function ReportCardView({
  card,
  photos,
  dogName,
  variant = "full",
}: {
  card: ReportCard;
  photos: ReportCardPhoto[];
  dogName: string;
  variant?: "full" | "teaser";
}) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

  // Group photos by date when any have one; otherwise render flat.
  const hasDates = photos.some((p) => p.photo_date);
  const dated = hasDates
    ? groupByDate(photos)
    : [{ date: null, photos }];

  // Teaser: show a couple of photos + truncated note.
  if (variant === "teaser") {
    const previewPhotos = photos.slice(0, 3);
    return (
      <div className="overflow-hidden rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 to-amber-50 p-5">
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-xl">🐾</span>
          <h3 className="font-semibold text-ink-900">
            New report card for {dogName}
          </h3>
        </div>
        {card.note && (
          <p className="mt-2 line-clamp-3 text-sm text-ink-700">{card.note}</p>
        )}
        {previewPhotos.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {previewPhotos.map((p) => {
              const url = reportCardPhotoPublicUrl(base, p.storage_path);
              if (!url) return null;
              return (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={p.id}
                  src={url}
                  alt={p.caption ?? `${dogName} report card photo`}
                  className="aspect-square w-full rounded-lg object-cover ring-1 ring-white/60"
                />
              );
            })}
          </div>
        )}
        <p className="mt-3 text-xs text-ink-500">
          Posted {card.published_at && formatDate(card.published_at)}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 to-amber-50">
      <div className="px-5 pt-5">
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-2xl">🐾</span>
          <div>
            <h3 className="font-semibold text-ink-900">
              {dogName}&apos;s report card
            </h3>
            {card.published_at && (
              <p className="text-xs text-ink-500">
                Posted {formatDate(card.published_at)}
              </p>
            )}
          </div>
        </div>

        {card.note && (
          <p className="mt-3 whitespace-pre-wrap text-ink-900">
            {card.note}
          </p>
        )}
      </div>

      {photos.length > 0 && (
        <div className="space-y-5 px-5 pb-5 pt-4">
          {dated.map((group) => (
            <div key={group.date ?? "any"}>
              {group.date && (
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
                  {formatDateShort(group.date)}
                </p>
              )}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {group.photos.map((p) => {
                  const url = reportCardPhotoPublicUrl(base, p.storage_path);
                  if (!url) return null;
                  return (
                    <figure
                      key={p.id}
                      className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-black/5"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={p.caption ?? `${dogName} report card photo`}
                        className="aspect-square w-full object-cover"
                      />
                      {p.caption && (
                        <figcaption className="px-2 py-1.5 text-xs text-ink-700">
                          {p.caption}
                        </figcaption>
                      )}
                    </figure>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function groupByDate(
  photos: ReportCardPhoto[],
): { date: string | null; photos: ReportCardPhoto[] }[] {
  const groups = new Map<string, ReportCardPhoto[]>();
  const undated: ReportCardPhoto[] = [];
  for (const p of photos) {
    if (p.photo_date) {
      const arr = groups.get(p.photo_date) ?? [];
      arr.push(p);
      groups.set(p.photo_date, arr);
    } else {
      undated.push(p);
    }
  }
  const sorted: { date: string | null; photos: ReportCardPhoto[] }[] = Array.from(
    groups.entries(),
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, photos]) => ({ date, photos }));
  if (undated.length) sorted.push({ date: null, photos: undated });
  return sorted;
}
