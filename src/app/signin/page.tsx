import { redirect } from "next/navigation";
import { auth, signIn } from "@gshl-auth";
import type { SignInPageProps } from "@gshl-lib/auth/types";

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const [{ callbackUrl, error }, session] = await Promise.all([
    searchParams,
    auth(),
  ]);
  const destination =
    callbackUrl?.startsWith("/") && !callbackUrl.startsWith("//")
      ? callbackUrl
      : "/lockerroom";

  if (session?.user.status === "active") redirect(destination);

  return (
    <main className="flex min-h-[calc(100vh-5rem)] items-center justify-center bg-gradient-to-b from-slate-100 to-white px-4">
      <section className="w-full max-w-md rounded-2xl border bg-white p-8 text-center shadow-xl">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-900 text-xl font-bold text-white">
          GSHL
        </div>
        <h1 className="text-3xl font-bold">Welcome to the league</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in with your verified Google account to open the locker room,
          draft board, and league office.
        </p>
        {error ? (
          <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
            Sign-in could not be completed. Confirm that your account is active
            or ask a commissioner for help.
          </p>
        ) : null}
        <form
          className="mt-6"
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: destination });
          }}
        >
          <button
            type="submit"
            className="w-full rounded-lg border bg-white px-4 py-3 font-semibold shadow-sm transition hover:bg-gray-50"
          >
            Continue with Google
          </button>
        </form>
        <p className="mt-5 text-xs text-muted-foreground">
          New accounts receive viewer access until a commissioner approves a
          different role.
        </p>
      </section>
    </main>
  );
}
