export interface WhatsAppShareMessageInput {
  title: string;
  summary?: string | null;
  lines?: readonly (string | null | undefined)[];
  url?: string | null;
}

function formatWhatsAppLines(value: string, marker: "*" | "_"): string {
  return value
    .trim()
    .split("\n")
    .map((line) => {
      const text = line.trim();
      return text ? `${marker}${text}${marker}` : "";
    })
    .join("\n");
}

function formatWhatsAppBold(value: string): string {
  return formatWhatsAppLines(value, "*");
}

function formatWhatsAppItalic(value: string): string {
  return formatWhatsAppLines(value, "_");
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

  return [
    formatWhatsAppBold(title),
    summary ? formatWhatsAppItalic(summary) : undefined,
    details,
    url?.trim(),
  ]
    .filter((section): section is string => Boolean(section))
    .join("\n\n");
}

export function appendWhatsAppShareLink(message: string, url: string): string {
  return [message.trim(), url.trim()]
    .filter((section) => Boolean(section))
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
