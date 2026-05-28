import { dogPhotoPublicUrl } from "@/lib/dogPhoto";

export function DogAvatar({
  photoPath,
  name,
  size = 64,
}: {
  photoPath: string | null;
  name: string;
  size?: number;
}) {
  const url = dogPhotoPublicUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", photoPath);
  const initial = name.charAt(0).toUpperCase() || "🐕";
  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-100 text-brand-700"
      style={{ width: size, height: size, fontSize: size / 2.4 }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={name} className="h-full w-full object-cover" />
      ) : (
        <span className="font-bold">{initial}</span>
      )}
    </div>
  );
}
