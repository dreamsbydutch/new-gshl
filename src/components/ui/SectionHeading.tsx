import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export function SectionHeading({
  id,
  title,
  href,
  action,
}: {
  id: string;
  title: string;
  href?: string;
  action?: string;
}) {
  return (
    <header className="flex min-h-9 items-center justify-between gap-2 border-b border-slate-200">
      <h2 id={id} className="text-sm font-bold text-slate-950">
        {title}
      </h2>
      {href && action ? (
        <Link href={href} className="gshl-text-action">
          {action}
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      ) : null}
    </header>
  );
}
