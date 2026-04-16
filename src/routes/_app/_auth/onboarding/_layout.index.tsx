import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import {
  convexQuery,
  useConvexAction,
  useConvexMutation,
} from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import {
  BRAND_TONES,
  CONTENT_LANGUAGES,
  NETWORKS,
  ONBOARDING_STEPS,
  TARGET_AUDIENCES,
  type BrandTone,
  type ContentLanguage,
  type Network,
  type TargetAudience,
} from "@cvx/schema";
import { getLocaleCurrency } from "@/utils/misc";
import { cn } from "@/utils/misc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Route as DashboardRoute } from "@/routes/_app/_auth/dashboard/_layout.index";

export const Route = createFileRoute("/_app/_auth/onboarding/_layout/")({
  component: OnboardingShell,
  beforeLoad: () => ({
    title: "Onboarding",
  }),
});

const cadenceOptions = [
  { value: 3, title: "3/semaine", subtitle: "Presence legere" },
  { value: 5, title: "5/semaine", subtitle: "Le plus populaire" },
  { value: 7, title: "7/semaine", subtitle: "Tous les jours" },
  { value: 14, title: "14/semaine", subtitle: "Intensif" },
] as const;

const durationOptions = [2, 4, 8] as const;

const networkLabels: Record<Network, string> = {
  [NETWORKS.FACEBOOK]: "Facebook",
  [NETWORKS.INSTAGRAM]: "Instagram",
  [NETWORKS.LINKEDIN]: "LinkedIn",
};

const toneCopy: Record<BrandTone, string> = {
  [BRAND_TONES.PROFESSIONAL]: "Professionnel",
  [BRAND_TONES.WARM]: "Chaleureux",
  [BRAND_TONES.FUN]: "Fun",
  [BRAND_TONES.INSPIRING]: "Inspirant",
};

const audienceCopy: Record<TargetAudience, string> = {
  [TARGET_AUDIENCES.B2C]: "Particuliers",
  [TARGET_AUDIENCES.B2B]: "Entreprises",
  [TARGET_AUDIENCES.BOTH]: "Les deux",
};

const languageCopy: Record<ContentLanguage, string> = {
  [CONTENT_LANGUAGES.FR]: "Francais",
  [CONTENT_LANGUAGES.EN]: "English",
  [CONTENT_LANGUAGES.BOTH]: "Les deux",
};

type Step = "connect" | "business" | "cadence" | "generating";

function OnboardingShell() {
  const { data: user } = useQuery(convexQuery(api.app.getCurrentUser, {}));
  const saveProgress = useConvexMutation(api.app.saveOnboardingProgress);
  const finishOnboarding = useConvexMutation(api.app.finishOnboarding);
  const generateCalendar = useConvexAction(
    api.calendar.generateCalendarForCurrentUser,
  );
  const createFacebookConnection = useConvexAction(
    api.app.createFacebookConnection,
  );
  const syncFacebookPages = useConvexAction(api.app.syncFacebookPages);
  const selectFacebookPage = useConvexMutation(api.app.selectFacebookPage);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>("connect");
  const [businessCategory, setBusinessCategory] = useState("");
  const [targetAudience, setTargetAudience] = useState<TargetAudience | "">("");
  const [brandTone, setBrandTone] = useState<BrandTone | "">("");
  const [contentLanguage, setContentLanguage] = useState<ContentLanguage | "">("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<Network[]>([
    NETWORKS.FACEBOOK,
  ]);
  const [selectedCadence, setSelectedCadence] = useState(5);
  const [selectedDuration, setSelectedDuration] = useState(4);
  const [facebookConnectionError, setFacebookConnectionError] = useState<string | null>(null);
  const [isSyncingAfterCallback, setIsSyncingAfterCallback] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(8);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const generationStartedRef = useRef(false);

  const { mutateAsync: saveOnboardingProgress, isPending: isSaving } =
    useMutation({ mutationFn: saveProgress });
  const { mutateAsync: finishOnboardingFlow } = useMutation({
    mutationFn: finishOnboarding,
  });
  const { mutateAsync: runCalendarGeneration, isPending: isGeneratingCalendar } =
    useMutation({ mutationFn: generateCalendar });
  const { mutateAsync: startFacebookConnection, isPending: isConnectingFacebook } =
    useMutation({ mutationFn: createFacebookConnection });
  const { mutateAsync: refreshFacebookPages, isPending: isRefreshingFacebook } =
    useMutation({ mutationFn: syncFacebookPages });
  const { mutateAsync: chooseFacebookPage } = useMutation({
    mutationFn: selectFacebookPage,
  });

  // Restore state from user
  useEffect(() => {
    if (!user) return;
    if (user.onboardingCompletedAt) {
      navigate({ to: DashboardRoute.fullPath });
      return;
    }
    setBusinessCategory(user.businessCategory ?? "");
    setTargetAudience(user.targetAudience ?? "");
    setBrandTone(user.brandTone ?? "");
    setContentLanguage(user.contentLanguage ?? "");
    setSelectedCadence(user.selectedCadence ?? 5);
    setSelectedPlatforms(user.selectedPlatforms ?? [NETWORKS.FACEBOOK]);
    setSelectedDuration(user.selectedDurationWeeks ?? 4);

    const hasConnected =
      (user.connectedPlatforms ?? []).includes(NETWORKS.FACEBOOK) &&
      (user.facebookPages?.length ?? 0) > 0 &&
      !!user.selectedFacebookPageId;

    if (user.onboardingStep === ONBOARDING_STEPS.GENERATING) {
      setStep("generating");
    } else if (user.onboardingStep === ONBOARDING_STEPS.CADENCE) {
      setStep("cadence");
    } else if (
      user.onboardingStep === ONBOARDING_STEPS.BUSINESS_INFO ||
      user.onboardingStep === ONBOARDING_STEPS.EDITORIAL_PROFILE
    ) {
      setStep("business");
    } else if (hasConnected && user.businessCategory) {
      setStep("cadence");
    } else if (hasConnected) {
      setStep("business");
    } else {
      setStep("connect");
    }
  }, [navigate, user]);

  // Facebook callback
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("uploadPost") !== "facebook_connected") return;

    params.delete("uploadPost");
    const next = `${window.location.pathname}${
      params.toString() ? `?${params.toString()}` : ""
    }`;
    window.history.replaceState({}, "", next);

    setIsSyncingAfterCallback(true);
    refreshFacebookPages({})
      .then(() => {
        queryClient.invalidateQueries({
          queryKey: convexQuery(api.app.getCurrentUser, {}).queryKey,
        });
      })
      .catch(() => {
        setFacebookConnectionError(
          "Impossible de recuperer vos pages. Reessayez.",
        );
      })
      .finally(() => {
        setIsSyncingAfterCallback(false);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Generation step
  useEffect(() => {
    if (step !== "generating") {
      generationStartedRef.current = false;
      setGenerationProgress(8);
      setGenerationError(null);
      return;
    }
    if (generationStartedRef.current) return;
    generationStartedRef.current = true;
    setGenerationError(null);

    let progress = 8;
    const interval = window.setInterval(() => {
      progress = Math.min(progress + 5, 92);
      setGenerationProgress(progress);
    }, 800);

    Promise.all([
      runCalendarGeneration({}),
      new Promise((r) => setTimeout(r, 6000)),
    ])
      .then(async () => {
        window.clearInterval(interval);
        setGenerationProgress(100);
        await finishOnboardingFlow({ currency: getLocaleCurrency() });
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: convexQuery(api.app.getCurrentUser, {}).queryKey,
          }),
          queryClient.invalidateQueries({
            queryKey: convexQuery(api.calendar.getCurrentCalendar, {}).queryKey,
          }),
          queryClient.invalidateQueries({
            queryKey: convexQuery(api.calendar.getCurrentCalendarPosts, {})
              .queryKey,
          }),
        ]);
        navigate({ to: DashboardRoute.fullPath });
      })
      .catch((error) => {
        window.clearInterval(interval);
        generationStartedRef.current = false;
        setGenerationProgress(8);
        setGenerationError(
          error instanceof Error
            ? error.message
            : "La generation du calendrier a echoue.",
        );
      });

    return () => {
      window.clearInterval(interval);
    };
  }, [
    step,
    finishOnboardingFlow,
    navigate,
    queryClient,
    runCalendarGeneration,
  ]);

  if (!user) return null;

  const hasConnectedFacebook =
    (user.connectedPlatforms ?? []).includes(NETWORKS.FACEBOOK) &&
    (user.facebookPages?.length ?? 0) > 0;

  const totalPosts =
    selectedCadence * selectedPlatforms.length * selectedDuration;

  const handleFacebookConnect = async () => {
    setFacebookConnectionError(null);
    try {
      const result = await startFacebookConnection({});
      if (result?.accessUrl) window.location.href = result.accessUrl;
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Connexion impossible.";
      setFacebookConnectionError(msg);
    }
  };

  const goToBusiness = () => setStep("business");

  const saveBusiness = async () => {
    await saveOnboardingProgress({
      step: ONBOARDING_STEPS.CADENCE,
      businessCategory: businessCategory.trim(),
      targetAudience: targetAudience || undefined,
      brandTone: brandTone || undefined,
      contentLanguage: contentLanguage || undefined,
    });
    setStep("cadence");
  };

  const launchGeneration = async () => {
    const summary = `${toneCopy[brandTone as BrandTone] ?? "Chaleureux"} pour ${businessCategory.toLowerCase() || "activite locale"}`;
    const themes = [businessCategory, audienceCopy[targetAudience as TargetAudience] ?? ""].filter(Boolean);
    const schedule =
      contentLanguage === CONTENT_LANGUAGES.EN
        ? ["Tuesday 10:00", "Thursday 10:00", "Saturday 11:00"]
        : ["Mardi 10h", "Jeudi 10h", "Samedi 11h"];
    const samplePosts = [
      `Decouvrez notre approche unique en ${businessCategory.toLowerCase() || "local"}.`,
      `3 raisons de nous faire confiance.`,
      `En coulisses : notre methode au quotidien.`,
    ];
    await saveOnboardingProgress({
      step: ONBOARDING_STEPS.GENERATING,
      selectedCadence,
      selectedPlatforms,
      selectedDurationWeeks: selectedDuration,
      editorialSummary: summary,
      editorialThemes: themes,
      recommendedSchedule: schedule,
      samplePosts,
    });
    setStep("generating");
  };

  const stepIndex = step === "connect" ? 0 : step === "business" ? 1 : step === "cadence" ? 2 : 3;
  const progressPct = step === "generating" ? generationProgress : [15, 40, 70, 90][stepIndex];

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col justify-center gap-6 px-6 py-16">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary/50">
            SocialPulse
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-primary">
            {step === "connect" && "Connecte ton reseau"}
            {step === "business" && "Ton activite"}
            {step === "cadence" && "Ta cadence de publication"}
            {step === "generating" && "Generation du calendrier"}
          </h1>
        </div>
        {(isSaving || isSyncingAfterCallback) && (
          <Loader2 className="h-5 w-5 animate-spin text-primary/60" />
        )}
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-primary/10">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* STEP 1: Connect network */}
      {step === "connect" && (
        <section className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <button
              type="button"
              onClick={handleFacebookConnect}
              className={cn(
                "rounded-3xl border p-6 text-left transition",
                hasConnectedFacebook
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card",
              )}
            >
              <p className="text-xl font-semibold text-primary">Facebook</p>
              {(isConnectingFacebook || isRefreshingFacebook || isSyncingAfterCallback) && (
                <Loader2 className="mt-3 h-4 w-4 animate-spin text-primary/60" />
              )}
              <p className="mt-2 text-sm text-primary/60">
                Connecter ta page Facebook
              </p>
            </button>
            <button
              type="button"
              disabled
              className="cursor-not-allowed rounded-3xl border border-border bg-card p-6 text-left opacity-50"
            >
              <p className="text-xl font-semibold text-primary">Instagram</p>
              <p className="mt-2 text-sm text-primary/60">Bientot</p>
            </button>
            <button
              type="button"
              disabled
              className="cursor-not-allowed rounded-3xl border border-border bg-card p-6 text-left opacity-50"
            >
              <p className="text-xl font-semibold text-primary">LinkedIn</p>
              <p className="mt-2 text-sm text-primary/60">Bientot</p>
            </button>
          </div>

          {facebookConnectionError && (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              {facebookConnectionError}
            </div>
          )}

          {(user.facebookPages?.length ?? 0) > 0 && (
            <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <p className="text-lg font-semibold text-primary">
                Pages detectees
              </p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {user.facebookPages?.map((page) => (
                  <button
                    key={page.id}
                    type="button"
                    className={cn(
                      "rounded-2xl border p-5 text-left transition",
                      user.selectedFacebookPageId === page.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40",
                    )}
                    onClick={() =>
                      chooseFacebookPage({ facebookPageId: page.id })
                    }
                  >
                    <p className="font-semibold text-primary">{page.name}</p>
                    <p className="mt-1 text-xs text-primary/60">{page.id}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {(user.facebookPages?.length ?? 0) === 0 && !facebookConnectionError && (
            <p className="rounded-2xl bg-secondary/60 p-4 text-sm text-primary/70">
              Connecte ta page Facebook pour commencer.
            </p>
          )}

          <div className="flex justify-end">
            <Button
              onClick={goToBusiness}
              disabled={!user.selectedFacebookPageId}
            >
              Continuer
            </Button>
          </div>
        </section>
      )}

      {/* STEP 2: Secteur d'activite */}
      {step === "business" && (
        <section className="space-y-6 rounded-3xl border border-border bg-card p-8 shadow-sm">
          <div>
            <p className="text-sm text-primary/60">
              Dis-nous en plus sur ton activite pour personnaliser ton contenu.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-primary">
                Secteur d'activite
              </label>
              <Input
                className="mt-2"
                value={businessCategory}
                onChange={(e) => setBusinessCategory(e.target.value)}
                placeholder="Ex: coiffure, restaurant, coaching, boutique"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {["Coiffure", "Restaurant", "Hotel", "Coaching", "Boutique"].map(
                  (s) => (
                    <button
                      key={s}
                      type="button"
                      className="rounded-full border border-border px-3 py-1 text-sm text-primary/70 hover:border-primary hover:text-primary"
                      onClick={() => setBusinessCategory(s)}
                    >
                      {s}
                    </button>
                  ),
                )}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-primary">
                Tes clients
              </label>
              <div className="mt-2 flex gap-3">
                {(Object.keys(audienceCopy) as TargetAudience[]).map((a) => (
                  <button
                    key={a}
                    type="button"
                    className={cn(
                      "rounded-full border px-4 py-2 text-sm",
                      targetAudience === a
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border text-primary/60",
                    )}
                    onClick={() => setTargetAudience(a)}
                  >
                    {audienceCopy[a]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-primary">Ton</label>
              <div className="mt-2 flex flex-wrap gap-3">
                {(Object.keys(toneCopy) as BrandTone[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={cn(
                      "rounded-full border px-4 py-2 text-sm",
                      brandTone === t
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border text-primary/60",
                    )}
                    onClick={() => setBrandTone(t)}
                  >
                    {toneCopy[t]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-primary">Langue</label>
              <div className="mt-2 flex gap-3">
                {(Object.keys(languageCopy) as ContentLanguage[]).map((l) => (
                  <button
                    key={l}
                    type="button"
                    className={cn(
                      "rounded-full border px-4 py-2 text-sm",
                      contentLanguage === l
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border text-primary/60",
                    )}
                    onClick={() => setContentLanguage(l)}
                  >
                    {languageCopy[l]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep("connect")}>
              Retour
            </Button>
            <Button
              onClick={saveBusiness}
              disabled={!businessCategory.trim()}
            >
              Continuer
            </Button>
          </div>
        </section>
      )}

      {/* STEP 3: Cadence + CTA Generer */}
      {step === "cadence" && (
        <section className="space-y-6 rounded-3xl border border-border bg-card p-8 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {cadenceOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={cn(
                  "rounded-2xl border p-5 text-left transition",
                  selectedCadence === opt.value
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/40",
                )}
                onClick={() => setSelectedCadence(opt.value)}
              >
                {opt.value === 5 && (
                  <span className="mb-3 inline-flex rounded-full bg-primary px-2 py-1 text-xs font-medium text-primary-foreground">
                    Recommande
                  </span>
                )}
                <p className="text-xl font-semibold text-primary">
                  {opt.title}
                </p>
                <p className="mt-1 text-sm text-primary/70">{opt.subtitle}</p>
              </button>
            ))}
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-primary">Reseaux</p>
              <div className="mt-3 flex flex-wrap gap-3">
                {(Object.keys(networkLabels) as Network[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={cn(
                      "rounded-full border px-4 py-2 text-sm",
                      selectedPlatforms.includes(p)
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border text-primary/60",
                    )}
                    disabled={p !== NETWORKS.FACEBOOK}
                    onClick={() =>
                      setSelectedPlatforms((prev) =>
                        prev.includes(p)
                          ? prev.length > 1
                            ? prev.filter((x) => x !== p)
                            : prev
                          : [...prev, p],
                      )
                    }
                  >
                    {networkLabels[p]}
                    {p !== NETWORKS.FACEBOOK && " (bientot)"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-primary">Duree</p>
              <div className="mt-3 flex gap-3">
                {durationOptions.map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={cn(
                      "rounded-full border px-4 py-2 text-sm",
                      selectedDuration === d
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border text-primary/60",
                    )}
                    onClick={() => setSelectedDuration(d)}
                  >
                    {d} semaines
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-secondary/60 p-5">
            <p className="text-sm text-primary/60">Recapitulatif</p>
            <p className="mt-2 text-lg font-semibold text-primary">
              {selectedCadence} posts/sem × {selectedPlatforms.length} reseau ×{" "}
              {selectedDuration} semaines = {totalPosts} posts
            </p>
          </div>

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep("business")}>
              Retour
            </Button>
            <Button onClick={launchGeneration} className="gap-2">
              <Sparkles className="h-4 w-4" />
              Generer mon calendrier
            </Button>
          </div>
        </section>
      )}

      {/* STEP 4: Generating */}
      {step === "generating" && (
        <section className="space-y-6 rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
          <div className="mx-auto max-w-xl">
            <h2 className="text-2xl font-semibold text-primary">
              Ton calendrier prend forme
            </h2>
            <p className="mt-3 text-sm text-primary/60">
              Redaction des posts, creation des visuels et optimisation des
              horaires.
            </p>
          </div>
          <div className="mx-auto w-full max-w-2xl rounded-full bg-primary/10 p-1">
            <div
              className="h-3 rounded-full bg-primary transition-all"
              style={{ width: `${generationProgress}%` }}
            />
          </div>
          <div className="grid gap-3 text-left md:grid-cols-2">
            {[
              "Analyse de votre page...",
              "Identification de votre audience...",
              "Redaction de vos posts...",
              "Optimisation des horaires...",
            ].map((label, index) => (
              <div
                key={label}
                className={cn(
                  "rounded-2xl border p-4 text-sm",
                  generationProgress > (index + 1) * 20
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border text-primary/50",
                )}
              >
                {label}
              </div>
            ))}
          </div>
          {generationError && (
            <div className="mx-auto max-w-2xl rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-left text-sm text-destructive">
              <p className="font-medium">Generation interrompue</p>
              <p className="mt-1">{generationError}</p>
              <div className="mt-4">
                <Button
                  variant="outline"
                  disabled={isGeneratingCalendar}
                  onClick={() => {
                    generationStartedRef.current = false;
                    setGenerationError(null);
                    setGenerationProgress(8);
                    setStep("generating");
                  }}
                >
                  Relancer la generation
                </Button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
