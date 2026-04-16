import { useAuthActions } from "@convex-dev/auth/react";
import { Button } from "@/ui/button";
import { convexQuery, useConvexAuth } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Route as DashboardRoute } from "@/routes/_app/_auth/dashboard/_layout.index";
import { Route as OnboardingRoute } from "@/routes/_app/_auth/onboarding/_layout.index";

export const Route = createFileRoute("/_app/login/_layout/")({
  component: Login,
});

function Login() {
  const { signIn } = useAuthActions();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { data: user } = useQuery(convexQuery(api.app.getCurrentUser, {}));
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const errorMessage = useMemo(() => {
    if (typeof window === "undefined") {
      return null;
    }
    const error = new URLSearchParams(window.location.search).get("error");
    if (!error) {
      return null;
    }
    return error === "AccessDenied"
      ? "Google sign-in was cancelled."
      : "Google sign-in failed. Please try again.";
  }, []);

  useEffect(() => {
    if (isLoading) {
      return;
    }
    if (isAuthenticated && user) {
      navigate({
        to: user.onboardingCompletedAt
          ? DashboardRoute.fullPath
          : OnboardingRoute.fullPath,
      });
    }
  }, [isAuthenticated, isLoading, navigate, user]);

  const handleGoogleSignIn = async () => {
    setIsSubmitting(true);
    try {
      await signIn("google", { redirectTo: OnboardingRoute.fullPath });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-96 flex-col items-center justify-center gap-6">
      <div className="mb-2 flex flex-col gap-2">
        <h3 className="text-center text-2xl font-medium text-primary">
          Continue with Google
        </h3>
        <p className="text-center text-base font-normal text-primary/60">
          Use your Google account to access SocialPulse.
        </p>
      </div>

      {errorMessage && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-center text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      <Button
        type="button"
        variant="outline"
        className="w-full gap-2 bg-transparent"
        onClick={handleGoogleSignIn}
        disabled={isLoading || isSubmitting}
      >
        {(isLoading || isSubmitting) && (
          <Loader2 className="h-4 w-4 animate-spin" />
        )}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          viewBox="0 0 24 24"
        >
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
        Sign in with Google
      </Button>

      <p className="px-12 text-center text-sm font-normal leading-normal text-primary/60">
        Your account is created automatically on first sign-in and restored on
        your next visit.
      </p>
    </div>
  );
}
