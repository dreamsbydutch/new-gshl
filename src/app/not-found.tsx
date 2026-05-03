export default function NotFound() {
  return (
    <main className="container mx-auto flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4 py-10 text-center">
      <h1 className="text-3xl font-semibold">Page not found</h1>
      <p className="max-w-md text-sm text-gray-600">
        The page you requested does not exist or is no longer available.
      </p>
    </main>
  );
}
