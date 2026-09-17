import { abbreviatePlayerName } from "@gshl-utils";

export function CompactPlayerName({ name }: { name: string }) {
  return (
    <span className="block max-w-24 truncate lg:max-w-none" title={name}>
      <span aria-hidden="true" className="lg:hidden">
        {abbreviatePlayerName(name)}
      </span>
      <span className="sr-only lg:not-sr-only">{name}</span>
    </span>
  );
}
