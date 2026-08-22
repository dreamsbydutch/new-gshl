export interface WhatsAppShareMessageInput {
  title: string;
  summary?: string | null;
  lines?: readonly (string | null | undefined)[];
  url?: string | null;
}

export function buildWhatsAppShareMessage({
  title,
  summary,
  lines = [],
  url,
}: WhatsAppShareMessageInput): string {
  const details = lines
    .map((line) => line?.trim())
    .filter((line): line is string => Boolean(line))
    .join("\n");

  return [title.trim(), summary?.trim(), details, url?.trim()]
    .filter((section): section is string => Boolean(section))
    .join("\n\n");
}

export function buildWhatsAppShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message.trim())}`;
}

export function resolveWhatsAppShareLink(
  path: string | undefined,
  currentUrl: string,
  origin: string,
): string {
  return path ? new URL(path, origin).toString() : currentUrl;
}

export function canShareOwnerContent(role?: string | null): boolean {
  return role === "owner" || role === "commissioner";
}

export function canShareCommissionerContent(role?: string | null): boolean {
  return role === "commissioner";
}
