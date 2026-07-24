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
          <p className="mt-6 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
            Google sign-in is not configured for this deployment. Add the
            Auth.js, Google OAuth, and Convex server secrets to the hosting
            environment, then redeploy.
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
