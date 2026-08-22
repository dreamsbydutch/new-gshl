import Image from "next/image";

export function SignInContent({
  error,
  isOAuthConfigured,
  signInAction,
}: {
  error?: string;
  isOAuthConfigured: boolean;
  signInAction: () => Promise<void>;
}) {
  return (
    <main className="flex min-h-[calc(100vh-5rem)] items-center justify-center px-4">
      <section className="w-full max-w-sm border-y border-slate-200 py-6 text-center">
        <Image
          src="/favicon.ico"
          alt="GSHL"
          width={64}
          height={64}
          className="mx-auto mb-3 h-14 w-14 object-contain"
        />
        <h1 className="text-2xl font-bold">Sign in to GSHL</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Open My Team, Draft, and League Office.
        </p>
        {error ? (
          <p className="mt-4 border-y border-red-200 py-2 text-sm text-red-700">
            Sign-in failed. Confirm your account is active or ask a
            commissioner.
          </p>
        ) : null}
        {isOAuthConfigured ? (
          <form className="mt-6" action={signInAction}>
            <button
              type="submit"
              className="w-full rounded-lg border bg-white px-4 py-3 font-semibold shadow-sm transition hover:bg-gray-50"
            >
              Continue with Google
            </button>
          </form>
        ) : (
          <p className="mt-6 border-y border-amber-200 py-2 text-sm text-amber-800">
            Google sign-in is not configured for this deployment.
          </p>
        )}
        <p className="mt-5 text-xs text-muted-foreground">
          New accounts receive viewer access until a commissioner approves a
          different role.
        </p>
      </section>
    </main>
  );
}
