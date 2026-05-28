export function dogPhotoPublicUrl(supabaseUrl: string, path: string | null): string | null {
  if (!path) return null;
  return `${supabaseUrl}/storage/v1/object/public/dog-photos/${path}`;
}
