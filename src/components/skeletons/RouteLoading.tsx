export function RouteLoading({
  children,
  label = "Loading",
}: {
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <div role="status" aria-label={label} aria-busy="true" className="contents">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
