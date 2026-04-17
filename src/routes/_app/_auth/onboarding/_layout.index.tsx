import { Button } from "@/ui/button";
import {
  convexQuery,
  useConvexAction,
  useConvexMutation,
} from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import {
  NETWORKS,
  ONBOARDING_STEPS,
  type Network,
} from "@cvx/schema";
import { getLocaleCurrency } from "@/utils/misc";
import { cn } from "@/utils/misc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Loader2,
  Sparkles,
  Check,
  Facebook,
  Instagram,
  Linkedin,
  ImageIcon,
  BarChart3,
  Clock,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Route as DashboardRoute } from "@/routes/_app/_auth/dashboard/_layout.index";

export const Route = createFileRoute("/_app/_auth/onboarding/_layout/")({
  component: OnboardingShell,
  beforeLoad: () => ({ title: "Onboarding" }),
});

type Step = "connect" | "analyzing" | "cadence" | "generating";

const cadenceOptions = [
  { value: 3, title: "3/semaine", subtitle: "Présence légère" },
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
  const analyzeChannel = useConvexAction(api.analyze.analyzeChannel);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>("connect");
  const [selectedPlatforms, setSelectedPlatforms] = useState<Network[]>([
    NETWORKS.FACEBOOK,
  ]);
  const [selectedCadence, setSelectedCadence] = useState(5);
  const [selectedDuration, setSelectedDuration] = useState(4);
  const [facebookError, setFacebookError] = useState<string | null>(null);
  const [isSyncingCallback, setIsSyncingCallback] = useState(false);

  // Analysis state
  const [analysisStatus, setAnalysisStatus] = useState<
    "idle" | "fetching" | "analyzing" | "importing" | "done" | "error"
  >("idle");
  const [analysisResult, setAnalysisResult] = useState<{
    sector: string;
    tone: string;
    themes: string[];
    bestHours: string[];
    bestDays: string[];
    recommendations: string;
    photosImported: number;
    postsAnalyzed: number;
  } | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Generation state
  const [generationProgress, setGenerationProgress] = useState(8);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const generationStartedRef = useRef(false);

  const { mutateAsync: saveOnboardingProgress } = useMutation({
    mutationFn: saveProgress,
  });
  const { mutateAsync: finishOnboardingFlow } = useMutation({
    mutationFn: finishOnboarding,
  });
  const { mutateAsync: runCalendarGeneration } = useMutation({
    mutationFn: generateCalendar,
  });
  const { mutateAsync: startFacebookConnection, isPending: isConnecting } =
    useMutation({ mutationFn: createFacebookConnection });
  const { mutateAsync: refreshFacebookPages, isPending: isRefreshing } =
    useMutation({ mutationFn: syncFacebookPages });
  const { mutateAsync: chooseFacebookPage } = useMutation({
    mutationFn: selectFacebookPage,
  });
  const { mutateAsync: runAnalysis } = useMutation({
    mutationFn: analyzeChannel,
  });

  // Restore state from user
  useEffect(() => {
    if (!user) return;
    if (user.onboardingCompletedAt) {
      navigate({ to: DashboardRoute.fullPath });
      return;
    }
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
    } else if (hasConnected && user.editorialSummary) {
      setStep("cadence");
    } else if (hasConnected) {
      setStep("analyzing");
    } else {
      setStep("connect");
    }
  }, [navigate, user]);

  // Facebook OAuth callback
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("uploadPost") !== "facebook_connected") return;
    params.delete("uploadPost");
    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}${params.toString() ? `?${params}` : ""}`,
    );
    setIsSyncingCallback(true);
    refreshFacebookPages({})
      .then(() =>
        queryClient.invalidateQueries({
          queryKey: convexQuery(api.app.getCurrentUser, {}).queryKey,
        }),
      )
      .catch(() => setFacebookError("Impossible de récupérer vos pages."))
      .finally(() => setIsSyncingCallback(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-trigger analysis when entering analysis step
  useEffect(() => {
    if (step !== "analyzing" || analysisStatus !== "idle") return;
    launchAnalysis();
  }, [step, analysisStatus]); // eslint-disable-line react-hooks/exhaustive-deps

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
        await queryClient.invalidateQueries();
        navigate({ to: DashboardRoute.fullPath });
      })
      .catch((error) => {
        window.clearInterval(interval);
        generationStartedRef.current = false;
        setGenerationProgress(8);
        setGenerationError(
          error instanceof Error ? error.message : "Génération échouée.",
        );
      });
    return () => window.clearInterval(interval);
  }, [step, finishOnboardingFlow, navigate, queryClient, runCalendarGeneration]);

  if (!user) return null;

  const hasConnectedFacebook =
    (user.connectedPlatforms ?? []).includes(NETWORKS.FACEBOOK) &&
    (user.facebookPages?.length ?? 0) > 0;

  const totalPosts =
    selectedCadence * selectedPlatforms.length * selectedDuration;

  // Handlers
  const handleFacebookConnect = async () => {
    setFacebookError(null);
    try {
      const result = await startFacebookConnection({});
      if (result?.accessUrl) window.location.href = result.accessUrl;
    } catch (error) {
      setFacebookError(
        error instanceof Error ? error.message : "Connexion impossible.",
      );
    }
  };

  const goToAnalysis = async () => {
    setAnalysisStatus("idle");
    setAnalysisResult(null);
    setStep("analyzing");
  };

  const launchAnalysis = async () => {
    setAnalysisStatus("fetching");
    setAnalysisError(null);

    const statusSteps: Array<typeof analysisStatus> = [
      "fetching",
      "analyzing",
      "importing",
    ];
    let statusIndex = 0;
    const statusInterval = setInterval(() => {
      statusIndex = Math.min(statusIndex + 1, statusSteps.length - 1);
      setAnalysisStatus(statusSteps[statusIndex]);
    }, 3000);

    try {
      const result = await runAnalysis({});
      clearInterval(statusInterval);
      setAnalysisResult({
        sector: result.profile.sector,
        tone: result.profile.tone,
        themes: result.profile.themes,
        bestHours: result.profile.bestHours,
        bestDays: result.profile.bestDays,
        recommendations: result.profile.recommendations,
        photosImported: result.photosImported,
        postsAnalyzed: result.postsAnalyzed,
      });
      setAnalysisStatus("done");
      await queryClient.invalidateQueries({
        queryKey: convexQuery(api.app.getCurrentUser, {}).queryKey,
      });
    } catch (error) {
      clearInterval(statusInterval);
      setAnalysisError(
        error instanceof Error ? error.message : "Analyse échouée.",
      );
      setAnalysisStatus("error");
    }
  };

  const goToCadence = async () => {
    await saveOnboardingProgress({
      step: ONBOARDING_STEPS.CADENCE,
    });
    setStep("cadence");
  };

  const launchGeneration = async () => {
    const summary =
      analysisResult?.tone ??
      user.editorialSummary ??
      "Chaleureux et accessible";
    const themes = analysisResult?.themes ?? user.editorialThemes ?? [];
    const schedule = (analysisResult?.bestDays ?? []).map(
      (day, i) =>
        `${day} ${(analysisResult?.bestHours ?? ["10:00"])[i % (analysisResult?.bestHours?.length ?? 1)]}`,
    );

    await saveOnboardingProgress({
      step: ONBOARDING_STEPS.GENERATING,
      selectedCadence,
      selectedPlatforms,
      selectedDurationWeeks: selectedDuration,
      editorialSummary: summary,
      editorialThemes: themes,
      recommendedSchedule:
        schedule.length > 0
          ? schedule
          : ["Mardi 10h", "Jeudi 10h", "Samedi 11h"],
      samplePosts: [],
    });
    setStep("generating");
  };

  const stepIndex =
    step === "connect" ? 0 : step === "analyzing" ? 1 : step === "cadence" ? 2 : 3;
  const progressPct =
    step === "generating"
      ? generationProgress
      : [12, 38, 68, 90][stepIndex];

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col justify-center gap-6 px-6 py-16">
      {/* Header */}
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary/50">
          SocialPulse
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-primary">
          {step === "connect" && "Connecte ton réseau"}
          {step === "analyzing" && "Analyse de ta page"}
          {step === "cadence" && "Ta cadence de publication"}
          {step === "generating" && "Génération du calendrier"}
        </h1>
      </div>

      {/* Progress bar */}
      <div className="h-2 overflow-hidden rounded-full bg-primary/10">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* ============ STEP 1: Connect ============ */}
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
              <div className="flex items-center gap-3">
                <Facebook className="h-6 w-6 text-blue-600" />
                <p className="text-xl font-semibold text-primary">Facebook</p>
              </div>
              {(isConnecting || isRefreshing || isSyncingCallback) && (
                <Loader2 className="mt-3 h-4 w-4 animate-spin text-primary/60" />
              )}
              {hasConnectedFacebook && (
                <div className="mt-3 flex items-center gap-2 text-sm text-green-600">
                  <Check className="h-4 w-4" /> Connecté
                </div>
              )}
              {!hasConnectedFacebook && (
                <p className="mt-2 text-sm text-primary/60">
                  Connecter ta page Facebook
                </p>
              )}
            </button>
            <button
              type="button"
              disabled
              className="cursor-not-allowed rounded-3xl border border-border bg-card p-6 text-left opacity-50"
            >
              <div className="flex items-center gap-3">
                <Instagram className="h-6 w-6" />
                <p className="text-xl font-semibold text-primary">Instagram</p>
              </div>
              <p className="mt-2 text-sm text-primary/60">Bientôt</p>
            </button>
            <button
              type="button"
              disabled
              className="cursor-not-allowed rounded-3xl border border-border bg-card p-6 text-left opacity-50"
            >
              <div className="flex items-center gap-3">
                <Linkedin className="h-6 w-6" />
                <p className="text-xl font-semibold text-primary">LinkedIn</p>
              </div>
              <p className="mt-2 text-sm text-primary/60">Bientôt</p>
            </button>
          </div>

          {facebookError && (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              {facebookError}
            </div>
          )}

          {(user.facebookPages?.length ?? 0) > 0 && (
            <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <p className="text-lg font-semibold text-primary">
                Pages détectées
              </p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {user.facebookPages?.map((page) => (
                  <button
                    key={page.id}
                    type="button"
                    className={cn(
                      "flex items-center gap-3 rounded-2xl border p-4 text-left transition",
                      user.selectedFacebookPageId === page.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40",
                    )}
                    onClick={() =>
                      chooseFacebookPage({ facebookPageId: page.id })
                    }
                  >
                    {page.picture ? (
                      <img
                        src={page.picture}
                        alt={page.name}
                        className="h-10 w-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600" />
                    )}
                    <div>
                      <p className="font-semibold text-primary">{page.name}</p>
                      {user.selectedFacebookPageId === page.id && (
                        <span className="text-xs text-green-600">
                          Sélectionnée
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {(user.facebookPages?.length ?? 0) === 0 && !facebookError && (
            <p className="rounded-2xl bg-secondary/60 p-4 text-sm text-primary/70">
              Connecte ta page Facebook pour commencer.
            </p>
          )}

          <div className="flex justify-end">
            <Button
              onClick={goToAnalysis}
              disabled={!user.selectedFacebookPageId}
            >
              Analyser ma page
            </Button>
          </div>
        </section>
      )}

      {/* ============ STEP 2: Analysis ============ */}
      {step === "analyzing" && (
        <section className="space-y-6">
          {analysisStatus !== "done" && analysisStatus !== "error" && (
            <div className="rounded-3xl border border-border bg-card p-8 shadow-sm">
              <div className="mx-auto max-w-md text-center">
                <Sparkles className="mx-auto h-10 w-10 animate-pulse text-primary" />
                <h2 className="mt-4 text-xl font-semibold text-primary">
                  SocialPulse analyse ta page
                </h2>
                <p className="mt-2 text-sm text-primary/60">
                  Récupération de tes publications, analyse du contenu et import
                  de tes photos.
                </p>
              </div>
              <div className="mt-8 grid gap-3 md:grid-cols-3">
                <AnalysisStep
                  label="Récupération des posts"
                  done={
                    analysisStatus === "analyzing" ||
                    analysisStatus === "importing"
                  }
                  active={analysisStatus === "fetching"}
                />
                <AnalysisStep
                  label="Analyse IA du contenu"
                  done={analysisStatus === "importing"}
                  active={analysisStatus === "analyzing"}
                />
                <AnalysisStep
                  label="Import des photos"
                  done={false}
                  active={analysisStatus === "importing"}
                />
              </div>
            </div>
          )}

          {analysisStatus === "done" && analysisResult && (
            <div className="space-y-4">
              <div className="rounded-3xl border border-primary/20 bg-card p-8 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-green-500/10 px-3 py-1 text-sm text-green-600">
                      <Check className="h-4 w-4" />
                      Analyse terminée
                    </div>
                    <h2 className="mt-3 text-2xl font-semibold text-primary">
                      {analysisResult.sector}
                    </h2>
                    <p className="mt-1 text-sm text-primary/60">
                      Ton : {analysisResult.tone}
                    </p>
                  </div>
                  <div className="text-right text-sm text-primary/60">
                    <p>{analysisResult.postsAnalyzed} posts analysés</p>
                    <p>{analysisResult.photosImported} photos importées</p>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap gap-2">
                  {analysisResult.themes.map((theme) => (
                    <span
                      key={theme}
                      className="rounded-full bg-secondary px-3 py-1 text-sm text-primary/70"
                    >
                      {theme}
                    </span>
                  ))}
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl bg-secondary/60 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-primary">
                      <Clock className="h-4 w-4" />
                      Meilleurs créneaux
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {analysisResult.bestDays.map((day, i) => (
                        <span
                          key={day}
                          className="rounded-full bg-card px-3 py-1 text-sm text-primary/70"
                        >
                          {day}{" "}
                          {analysisResult.bestHours[
                            i % analysisResult.bestHours.length
                          ] ?? ""}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-secondary/60 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-primary">
                      <ImageIcon className="h-4 w-4" />
                      Banque photos
                    </div>
                    <p className="mt-2 text-2xl font-bold text-primary">
                      {analysisResult.photosImported}
                    </p>
                    <p className="text-xs text-primary/60">
                      photos récupérées depuis Facebook
                    </p>
                  </div>
                </div>

                {analysisResult.recommendations && (
                  <div className="mt-6 rounded-2xl bg-primary/5 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-primary">
                      <BarChart3 className="h-4 w-4" />
                      Recommandations
                    </div>
                    <p className="mt-2 text-sm text-primary/70">
                      {analysisResult.recommendations}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <Button onClick={goToCadence} className="gap-2">
                  C'est bien moi — continuer
                </Button>
              </div>
            </div>
          )}

          {analysisStatus === "error" && (
            <div className="rounded-3xl border border-destructive/30 bg-destructive/10 p-8 text-center">
              <p className="font-medium text-destructive">Analyse échouée</p>
              <p className="mt-2 text-sm text-destructive/80">
                {analysisError}
              </p>
              <div className="mt-4 flex justify-center gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setAnalysisStatus("idle");
                    setAnalysisError(null);
                  }}
                >
                  Réessayer
                </Button>
                <Button onClick={goToCadence}>
                  Passer et continuer
                </Button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ============ STEP 3: Cadence + CTA ============ */}
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
                    Recommandé
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
              <p className="text-sm font-medium text-primary">Réseaux</p>
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
                    {p !== NETWORKS.FACEBOOK && " (bientôt)"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-primary">Durée</p>
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
            <p className="text-sm text-primary/60">Récapitulatif</p>
            <p className="mt-2 text-lg font-semibold text-primary">
              {selectedCadence} posts/sem × {selectedPlatforms.length} réseau ×{" "}
              {selectedDuration} semaines = {totalPosts} posts
            </p>
          </div>

          <div className="flex justify-between">
            <Button
              variant="ghost"
              onClick={() => setStep("analyzing")}
            >
              Retour
            </Button>
            <Button onClick={launchGeneration} className="gap-2">
              <Sparkles className="h-4 w-4" />
              Générer mon calendrier
            </Button>
          </div>
        </section>
      )}

      {/* ============ STEP 4: Generating ============ */}
      {step === "generating" && (
        <section className="space-y-6 rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
          <div className="mx-auto max-w-xl">
            <h2 className="text-2xl font-semibold text-primary">
              Ton calendrier prend forme
            </h2>
            <p className="mt-3 text-sm text-primary/60">
              Rédaction des posts, création des visuels et optimisation des
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
              "Rédaction de vos posts...",
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
              <p className="font-medium">Génération interrompue</p>
              <p className="mt-1">{generationError}</p>
              <div className="mt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    generationStartedRef.current = false;
                    setGenerationError(null);
                    setGenerationProgress(8);
                    setStep("generating");
                  }}
                >
                  Relancer la génération
                </Button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function AnalysisStep({
  label,
  done,
  active,
}: {
  label: string;
  done: boolean;
  active: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-4 text-center text-sm transition-all",
        done
          ? "border-green-500/30 bg-green-500/5 text-green-700"
          : active
            ? "border-primary bg-primary/5 text-primary"
            : "border-border text-primary/40",
      )}
    >
      {done && <Check className="mx-auto mb-2 h-5 w-5 text-green-600" />}
      {active && (
        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-primary" />
      )}
      {label}
    </div>
  );
}
