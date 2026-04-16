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
  PAYMENT_METHODS,
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

type QuestionnaireState = {
  businessCategory: string;
  targetAudience: TargetAudience | "";
  brandTone: BrandTone | "";
  differentiator: string;
  contentLanguage: ContentLanguage | "";
};

const toneCopy: Record<BrandTone, { title: string; example: string }> = {
  [BRAND_TONES.PROFESSIONAL]: {
    title: "Professionnel",
    example: "Nous sommes ravis de vous accueillir",
  },
  [BRAND_TONES.WARM]: {
    title: "Chaleureux",
    example: "Passez nous voir, on vous attend !",
  },
  [BRAND_TONES.FUN]: {
    title: "Fun",
    example: "Prets pour une transformation ?",
  },
  [BRAND_TONES.INSPIRING]: {
    title: "Inspirant",
    example: "Croyez en votre potentiel",
  },
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

const networkLabels: Record<Network, string> = {
  [NETWORKS.FACEBOOK]: "Facebook",
  [NETWORKS.INSTAGRAM]: "Instagram",
  [NETWORKS.LINKEDIN]: "LinkedIn",
};

const cadenceOptions = [
  {
    value: 3,
    title: "3/semaine",
    subtitle: "Presence legere",
    description: "Ideal pour demarrer",
  },
  {
    value: 5,
    title: "5/semaine",
    subtitle: "Presence active",
    description: "Le plus populaire",
  },
  {
    value: 7,
    title: "7/semaine",
    subtitle: "Tous les jours",
    description: "Pour accelerer",
  },
  {
    value: 14,
    title: "14/semaine",
    subtitle: "Intensif",
    description: "2 posts par jour",
  },
] as const;

const durationOptions = [2, 4, 8] as const;

export const Route = createFileRoute("/_app/_auth/onboarding/_layout/")({
  component: OnboardingShell,
  beforeLoad: () => ({
    title: "Onboarding",
  }),
});

function deriveEditorialProfile(input: {
  businessCategory?: string;
  brandTone?: BrandTone;
  differentiator?: string;
  targetAudience?: TargetAudience;
  contentLanguage?: ContentLanguage;
}) {
  const category = input.businessCategory?.trim() || "Activite locale";
  const differentiator =
    input.differentiator?.trim() || "expertise terrain et resultats visibles";
  const tone = input.brandTone || BRAND_TONES.WARM;
  const audience = input.targetAudience || TARGET_AUDIENCES.B2C;
  const language = input.contentLanguage || CONTENT_LANGUAGES.FR;
  const toneLabel =
    tone === BRAND_TONES.PROFESSIONAL
      ? "Professionnel et rassurant"
      : tone === BRAND_TONES.WARM
        ? "Chaleureux et accessible"
        : tone === BRAND_TONES.FUN
          ? "Fun et energique"
          : "Inspirant et ambitieux";
  const themes = [
    `${category}`,
    "Avant / apres",
    audienceCopy[audience],
    differentiator,
  ];
  const schedule =
    language === CONTENT_LANGUAGES.EN
      ? ["Tuesday at 10:00", "Thursday at 10:00", "Saturday at 11:00"]
      : ["Mardi a 10h", "Jeudi a 10h", "Samedi a 11h"];
  const samplePosts =
    language === CONTENT_LANGUAGES.EN
      ? [
          `Meet the team behind your next ${category.toLowerCase()} success story.`,
          `Three reasons clients choose us for ${category.toLowerCase()}.`,
          `Behind the scenes: how we deliver ${differentiator}.`,
        ]
      : [
          `Decouvrez comment notre approche ${differentiator} fait la difference.`,
          `3 raisons de nous confier votre prochain besoin en ${category.toLowerCase()}.`,
          `En coulisses: notre methode pour offrir une experience ${toneLabel.toLowerCase()}.`,
        ];

  return {
    summary: `${toneLabel} pour ${category.toLowerCase()}`,
    themes,
    schedule,
    samplePosts,
  };
}

function getQuestionIndex(state: QuestionnaireState) {
  if (!state.businessCategory.trim()) return 0;
  if (!state.targetAudience) return 1;
  if (!state.brandTone) return 2;
  if (!state.differentiator.trim()) return 3;
  if (!state.contentLanguage) return 4;
  return 5;
}

function OnboardingShell() {
  const { data: user } = useQuery(convexQuery(api.app.getCurrentUser, {}));
  const saveProgress = useConvexMutation(api.app.saveOnboardingProgress);
  const finishOnboarding = useConvexMutation(api.app.finishOnboarding);
  const createFacebookConnection = useConvexAction(
    api.app.createFacebookConnection,
  );
  const syncFacebookPages = useConvexAction(api.app.syncFacebookPages);
  const selectFacebookPage = useConvexMutation(api.app.selectFacebookPage);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [questionnaire, setQuestionnaire] = useState<QuestionnaireState>({
    businessCategory: "",
    targetAudience: "",
    brandTone: "",
    differentiator: "",
    contentLanguage: "",
  });
  const [editorialDraft, setEditorialDraft] = useState({
    summary: "",
    themesText: "",
    scheduleText: "",
    samplePostsText: "",
  });
  const [selectedPlatforms, setSelectedPlatforms] = useState<Network[]>([
    NETWORKS.FACEBOOK,
  ]);
  const [selectedCadence, setSelectedCadence] = useState(5);
  const [selectedDuration, setSelectedDuration] = useState(4);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [isEditingEditorial, setIsEditingEditorial] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(8);
  const [facebookConnectionError, setFacebookConnectionError] = useState<
    string | null
  >(null);
  const [isSyncingAfterCallback, setIsSyncingAfterCallback] = useState(false);
  const generationStartedRef = useRef(false);

  const { mutateAsync: saveOnboardingProgress, isPending: isSaving } =
    useMutation({
      mutationFn: saveProgress,
    });
  const { mutateAsync: finishOnboardingFlow } = useMutation({
    mutationFn: finishOnboarding,
  });
  const { mutateAsync: startFacebookConnection, isPending: isConnectingFacebook } =
    useMutation({
      mutationFn: createFacebookConnection,
    });
  const { mutateAsync: refreshFacebookPages, isPending: isRefreshingFacebook } =
    useMutation({
      mutationFn: syncFacebookPages,
    });
  const { mutateAsync: chooseFacebookPage, isPending: isSelectingFacebookPage } =
    useMutation({
      mutationFn: selectFacebookPage,
    });

  useEffect(() => {
    if (!user) {
      return;
    }
    if (user.onboardingCompletedAt) {
      navigate({ to: DashboardRoute.fullPath });
      return;
    }
    setQuestionnaire({
      businessCategory: user.businessCategory ?? "",
      targetAudience: user.targetAudience ?? "",
      brandTone: user.brandTone ?? "",
      differentiator: user.differentiator ?? "",
      contentLanguage: user.contentLanguage ?? "",
    });
    const derived = deriveEditorialProfile({
      businessCategory: user.businessCategory,
      brandTone: user.brandTone,
      differentiator: user.differentiator,
      targetAudience: user.targetAudience,
      contentLanguage: user.contentLanguage,
    });
    setEditorialDraft({
      summary: user.editorialSummary ?? derived.summary,
      themesText: (user.editorialThemes ?? derived.themes).join(", "),
      scheduleText: (user.recommendedSchedule ?? derived.schedule).join("\n"),
      samplePostsText: (user.samplePosts ?? derived.samplePosts).join("\n\n"),
    });
    setSelectedCadence(user.selectedCadence ?? 5);
    setSelectedPlatforms(user.selectedPlatforms ?? [NETWORKS.FACEBOOK]);
    setSelectedDuration(user.selectedDurationWeeks ?? 4);
  }, [navigate, user]);

  useEffect(() => {
    if (!user || user.onboardingStep !== ONBOARDING_STEPS.GENERATING) {
      generationStartedRef.current = false;
      setGenerationProgress(8);
      return;
    }
    if (generationStartedRef.current) {
      return;
    }
    generationStartedRef.current = true;
    let progress = 8;
    const interval = window.setInterval(() => {
      progress = Math.min(progress + 6, 100);
      setGenerationProgress(progress);
    }, 900);
    const timeout = window.setTimeout(async () => {
      window.clearInterval(interval);
      await finishOnboardingFlow({
        currency: getLocaleCurrency(),
      });
      navigate({ to: DashboardRoute.fullPath });
    }, 15000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [finishOnboardingFlow, navigate, user]);

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
          "Impossible de récupérer vos pages. Réessayez.",
        );
      })
      .finally(() => {
        setIsSyncingAfterCallback(false);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const currentStep =
    user?.onboardingStep ?? ONBOARDING_STEPS.CONNECT_NETWORK;
  const questionIndex = getQuestionIndex(questionnaire);
  const totalPosts = selectedCadence * selectedPlatforms.length * selectedDuration;
  const estimatedPrice = totalPosts * 625;

  if (!user) {
    return null;
  }

  const goToStep = async (step: (typeof ONBOARDING_STEPS)[keyof typeof ONBOARDING_STEPS]) => {
    await saveOnboardingProgress({ step });
  };

  const togglePostingPlatform = (platform: Network) => {
    setSelectedPlatforms((previous) => {
      if (previous.includes(platform)) {
        return previous.length === 1
          ? previous
          : previous.filter((value) => value !== platform);
      }
      return [...previous, platform];
    });
  };

  const saveQuestionnaire = async () => {
    if (questionIndex < 5) {
      return;
    }
    await saveOnboardingProgress({
      step: ONBOARDING_STEPS.EDITORIAL_PROFILE,
      businessCategory: questionnaire.businessCategory.trim(),
      targetAudience: questionnaire.targetAudience || undefined,
      brandTone: questionnaire.brandTone || undefined,
      differentiator: questionnaire.differentiator.trim(),
      contentLanguage: questionnaire.contentLanguage || undefined,
    });
  };

  const saveEditorial = async () => {
    await saveOnboardingProgress({
      step: ONBOARDING_STEPS.CADENCE,
      editorialSummary: editorialDraft.summary.trim(),
      editorialThemes: editorialDraft.themesText
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      recommendedSchedule: editorialDraft.scheduleText
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
      samplePosts: editorialDraft.samplePostsText
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
    });
    setIsEditingEditorial(false);
  };

  const saveCadence = async () => {
    await saveOnboardingProgress({
      step: ONBOARDING_STEPS.PHOTOS,
      selectedCadence,
      selectedPlatforms,
      selectedDurationWeeks: selectedDuration,
    });
  };

  const savePhotos = async () => {
    await saveOnboardingProgress({
      step: ONBOARDING_STEPS.PAYMENT,
      uploadedPhotoCount: photoFiles.length,
    });
  };

  const savePayment = async (paymentMethod: "mobile_money" | "card") => {
    await saveOnboardingProgress({
      step: ONBOARDING_STEPS.GENERATING,
      paymentMethod,
    });
  };

  const handleFacebookConnect = async () => {
    setFacebookConnectionError(null);
    try {
      const result = await startFacebookConnection({});
      if (!result?.accessUrl) {
        return;
      }
      window.location.href = result.accessUrl;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Connexion Facebook impossible.";
      if (message.includes("UPLOAD_POST_API_KEY")) {
        setFacebookConnectionError(
          "Upload-Post n'est pas configure. Ajoute UPLOAD_POST_API_KEY dans les variables d'environnement Convex.",
        );
        return;
      }
      if (message.includes("SITE_URL")) {
        setFacebookConnectionError(
          "SITE_URL n'est pas configure dans Convex. Definis l'URL publique de SocialPulse avant de connecter Facebook.",
        );
        return;
      }
      setFacebookConnectionError(message);
    }
  };

  const hasConnectedFacebook =
    (user.connectedPlatforms ?? []).includes(NETWORKS.FACEBOOK) &&
    (user.facebookPages?.length ?? 0) > 0;

  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col justify-center gap-6 px-6 py-16">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary/50">
            SocialPulse Onboarding
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-primary">
            {currentStep === ONBOARDING_STEPS.CONNECT_NETWORK &&
              "Connecte ton reseau"}
            {currentStep === ONBOARDING_STEPS.BUSINESS_INFO &&
              "Construisons ton profil editorial"}
            {currentStep === ONBOARDING_STEPS.EDITORIAL_PROFILE &&
              "Ton profil editorial"}
            {currentStep === ONBOARDING_STEPS.CADENCE &&
              "Choisis ton volume"}
            {currentStep === ONBOARDING_STEPS.PHOTOS &&
              "Ajoute tes photos"}
            {currentStep === ONBOARDING_STEPS.PAYMENT && "Finalise ton pack"}
            {currentStep === ONBOARDING_STEPS.GENERATING &&
              "Generation du calendrier"}
          </h1>
        </div>
        {isSaving && <Loader2 className="h-5 w-5 animate-spin text-primary/60" />}
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-primary/10">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{
            width: `${
              currentStep === ONBOARDING_STEPS.CONNECT_NETWORK
                ? 12
                : currentStep === ONBOARDING_STEPS.BUSINESS_INFO
                  ? 28
                  : currentStep === ONBOARDING_STEPS.EDITORIAL_PROFILE
                    ? 46
                    : currentStep === ONBOARDING_STEPS.CADENCE
                      ? 62
                      : currentStep === ONBOARDING_STEPS.PHOTOS
                        ? 77
                        : currentStep === ONBOARDING_STEPS.PAYMENT
                          ? 89
                          : currentStep === ONBOARDING_STEPS.GENERATING
                            ? generationProgress
                            : 100
            }%`,
          }}
        />
      </div>

      {currentStep === ONBOARDING_STEPS.CONNECT_NETWORK && (
        <section className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <NetworkCard
              title="Facebook"
              description="Disponible maintenant pour connecter tes pages."
              active={hasConnectedFacebook}
              disabled={false}
              loading={isConnectingFacebook || isRefreshingFacebook || isSyncingAfterCallback}
              onClick={handleFacebookConnect}
            />
            <NetworkCard
              title="Instagram"
              description="Bientot disponible au MVP."
              active={false}
              disabled
            />
            <NetworkCard
              title="LinkedIn"
              description="Bientot disponible au MVP."
              active={false}
              disabled
            />
          </div>

          <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-lg font-semibold text-primary">
                  Pages Facebook connectees
                </p>
                <p className="mt-1 text-sm text-primary/60">
                  Selectionne la page a analyser et a publier.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => refreshFacebookPages({})}
                disabled={isRefreshingFacebook}
              >
                {isRefreshingFacebook && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Rafraichir
              </Button>
            </div>

            {facebookConnectionError && (
              <div className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                <p className="font-medium">Connexion Facebook indisponible</p>
                <p className="mt-1">{facebookConnectionError}</p>
                <pre className="mt-3 overflow-x-auto rounded-lg bg-black/5 p-3 text-xs text-foreground/80">
{`npx convex env set UPLOAD_POST_API_KEY <your-upload-post-api-key>
npx convex env set SITE_URL https://socialpulse-plum.vercel.app`}
                </pre>
              </div>
            )}

            {(user.facebookPages?.length ?? 0) === 0 && (
              <p className="mt-6 rounded-2xl bg-secondary/60 p-4 text-sm text-primary/70">
                Aucune page detectee pour le moment. Connecte ta page Facebook
                puis reviens ici.
              </p>
            )}

            {(user.facebookPages?.length ?? 0) > 0 && (
              <div className="mt-6 grid gap-3 md:grid-cols-2">
                {user.facebookPages?.map((page) => (
                  <ChoiceCard
                    key={page.id}
                    title={page.name}
                    description={page.id}
                    active={user.selectedFacebookPageId === page.id}
                    onClick={() =>
                      chooseFacebookPage({ facebookPageId: page.id })
                    }
                    loading={
                      isSelectingFacebookPage &&
                      user.selectedFacebookPageId !== page.id
                    }
                  />
                ))}
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <Button
                type="button"
                onClick={() => goToStep(ONBOARDING_STEPS.BUSINESS_INFO)}
                disabled={!user.selectedFacebookPageId}
              >
                Continuer
              </Button>
            </div>
          </div>
        </section>
      )}

      {currentStep === ONBOARDING_STEPS.BUSINESS_INFO && (
        <section className="rounded-3xl border border-border bg-card p-8 shadow-sm">
          <div className="mb-8 flex items-start justify-between gap-6">
            <div>
              <p className="text-sm text-primary/60">
                Route questionnaire MVP. L'analyse automatique de page sera
                branchee ensuite sur la meme etape.
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-primary">
                {questionIndex === 0 && "Vous faites quoi ?"}
                {questionIndex === 1 && "Vos clients ?"}
                {questionIndex === 2 && "Quel ton ?"}
                {questionIndex === 3 && "Votre truc en plus ?"}
                {questionIndex === 4 && "Quelle langue ?"}
              </h2>
            </div>
            <span className="rounded-full bg-secondary px-3 py-1 text-sm text-primary/70">
              Question {Math.min(questionIndex + 1, 5)} / 5
            </span>
          </div>

          {questionIndex === 0 && (
            <div className="space-y-4">
              <Input
                value={questionnaire.businessCategory}
                onChange={(event) =>
                  setQuestionnaire((previous) => ({
                    ...previous,
                    businessCategory: event.target.value,
                  }))
                }
                placeholder="Ex: coiffure, restaurant, coaching, boutique"
              />
              <div className="flex flex-wrap gap-2">
                {["Coiffure", "Restaurant", "Coaching", "Boutique"].map(
                  (suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      className="rounded-full border border-border px-3 py-1 text-sm text-primary/70 hover:border-primary hover:text-primary"
                      onClick={() =>
                        setQuestionnaire((previous) => ({
                          ...previous,
                          businessCategory: suggestion,
                        }))
                      }
                    >
                      {suggestion}
                    </button>
                  ),
                )}
              </div>
            </div>
          )}

          {questionIndex === 1 && (
            <div className="grid gap-3 md:grid-cols-3">
              {(
                Object.keys(audienceCopy) as TargetAudience[]
              ).map((audience) => (
                <ChoiceCard
                  key={audience}
                  active={questionnaire.targetAudience === audience}
                  title={audienceCopy[audience]}
                  onClick={() =>
                    setQuestionnaire((previous) => ({
                      ...previous,
                      targetAudience: audience,
                    }))
                  }
                />
              ))}
            </div>
          )}

          {questionIndex === 2 && (
            <div className="grid gap-3 md:grid-cols-2">
              {(Object.keys(toneCopy) as BrandTone[]).map((tone) => (
                <ChoiceCard
                  key={tone}
                  active={questionnaire.brandTone === tone}
                  title={toneCopy[tone].title}
                  description={toneCopy[tone].example}
                  onClick={() =>
                    setQuestionnaire((previous) => ({
                      ...previous,
                      brandTone: tone,
                    }))
                  }
                />
              ))}
            </div>
          )}

          {questionIndex === 3 && (
            <Input
              value={questionnaire.differentiator}
              onChange={(event) =>
                setQuestionnaire((previous) => ({
                  ...previous,
                  differentiator: event.target.value,
                }))
              }
              placeholder="Ex: Specialise en tresses africaines depuis 10 ans"
            />
          )}

          {questionIndex === 4 && (
            <div className="grid gap-3 md:grid-cols-3">
              {(
                Object.keys(languageCopy) as ContentLanguage[]
              ).map((language) => (
                <ChoiceCard
                  key={language}
                  active={questionnaire.contentLanguage === language}
                  title={languageCopy[language]}
                  onClick={() =>
                    setQuestionnaire((previous) => ({
                      ...previous,
                      contentLanguage: language,
                    }))
                  }
                />
              ))}
            </div>
          )}

          <div className="mt-8 flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              disabled={questionIndex === 0}
              onClick={() => {
                if (questionIndex === 1) {
                  setQuestionnaire((previous) => ({
                    ...previous,
                    targetAudience: "",
                  }));
                }
                if (questionIndex === 2) {
                  setQuestionnaire((previous) => ({
                    ...previous,
                    brandTone: "",
                  }));
                }
                if (questionIndex === 3) {
                  setQuestionnaire((previous) => ({
                    ...previous,
                    differentiator: "",
                  }));
                }
                if (questionIndex === 4) {
                  setQuestionnaire((previous) => ({
                    ...previous,
                    contentLanguage: "",
                  }));
                }
              }}
            >
              Retour
            </Button>
            <Button
              type="button"
              onClick={saveQuestionnaire}
              disabled={questionIndex < 5}
            >
              Continuer
            </Button>
          </div>
        </section>
      )}

      {currentStep === ONBOARDING_STEPS.EDITORIAL_PROFILE && (
        <section className="space-y-6 rounded-3xl border border-border bg-card p-8 shadow-sm">
          <div className="flex items-start justify-between gap-6">
            <div>
              <div className="inline-flex rounded-full bg-secondary px-3 py-1 text-sm text-primary/70">
                <Sparkles className="mr-2 h-4 w-4" />
                {questionnaire.businessCategory || "Activite locale"}
              </div>
              <h2 className="mt-3 text-2xl font-semibold text-primary">
                {editorialDraft.summary}
              </h2>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsEditingEditorial((value) => !value)}
            >
              {isEditingEditorial ? "Annuler" : "Modifier"}
            </Button>
          </div>

          {isEditingEditorial ? (
            <div className="grid gap-4">
              <Input
                value={editorialDraft.summary}
                onChange={(event) =>
                  setEditorialDraft((previous) => ({
                    ...previous,
                    summary: event.target.value,
                  }))
                }
                placeholder="Resume editorial"
              />
              <Input
                value={editorialDraft.themesText}
                onChange={(event) =>
                  setEditorialDraft((previous) => ({
                    ...previous,
                    themesText: event.target.value,
                  }))
                }
                placeholder="Themes separes par des virgules"
              />
              <textarea
                className="min-h-24 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={editorialDraft.scheduleText}
                onChange={(event) =>
                  setEditorialDraft((previous) => ({
                    ...previous,
                    scheduleText: event.target.value,
                  }))
                }
              />
              <textarea
                className="min-h-32 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={editorialDraft.samplePostsText}
                onChange={(event) =>
                  setEditorialDraft((previous) => ({
                    ...previous,
                    samplePostsText: event.target.value,
                  }))
                }
              />
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {editorialDraft.themesText
                  .split(",")
                  .map((item) => item.trim())
                  .filter(Boolean)
                  .map((theme) => (
                    <span
                      key={theme}
                      className="rounded-full bg-secondary px-3 py-1 text-sm text-primary/70"
                    >
                      {theme}
                    </span>
                  ))}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl bg-secondary/60 p-5">
                  <p className="text-sm font-medium text-primary">Creneaux recommandes</p>
                  <ul className="mt-3 space-y-2 text-sm text-primary/70">
                    {editorialDraft.scheduleText
                      .split("\n")
                      .map((item) => item.trim())
                      .filter(Boolean)
                      .map((slot) => (
                        <li key={slot}>{slot}</li>
                      ))}
                  </ul>
                </div>
                <div className="rounded-2xl bg-secondary/60 p-5">
                  <p className="text-sm font-medium text-primary">Exemples de posts</p>
                  <div className="mt-3 space-y-3 text-sm text-primary/70">
                    {editorialDraft.samplePostsText
                      .split("\n")
                      .map((item) => item.trim())
                      .filter(Boolean)
                      .map((post) => (
                        <p key={post} className="rounded-xl bg-card p-3">
                          {post}
                        </p>
                      ))}
                  </div>
                </div>
              </div>
            </>
          )}

          <div className="flex justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={() => goToStep(ONBOARDING_STEPS.BUSINESS_INFO)}
            >
              Retour
            </Button>
            <Button type="button" onClick={saveEditorial}>
              C'est bien moi
            </Button>
          </div>
        </section>
      )}

      {currentStep === ONBOARDING_STEPS.CADENCE && (
        <section className="space-y-6 rounded-3xl border border-border bg-card p-8 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {cadenceOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={cn(
                  "rounded-2xl border p-5 text-left transition",
                  selectedCadence === option.value
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/40",
                )}
                onClick={() => setSelectedCadence(option.value)}
              >
                {option.value === 5 && (
                  <span className="mb-3 inline-flex rounded-full bg-primary px-2 py-1 text-xs font-medium text-primary-foreground">
                    Recommande
                  </span>
                )}
                <p className="text-xl font-semibold text-primary">{option.title}</p>
                <p className="mt-1 text-sm font-medium text-primary/70">
                  {option.subtitle}
                </p>
                <p className="mt-3 text-sm text-primary/60">{option.description}</p>
              </button>
            ))}
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-primary">Reseaux</p>
              <div className="mt-3 flex flex-wrap gap-3">
                {(Object.keys(networkLabels) as Network[]).map((platform) => (
                  <button
                    key={platform}
                    type="button"
                    className={cn(
                      "rounded-full border px-4 py-2 text-sm",
                      selectedPlatforms.includes(platform)
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border text-primary/60",
                    )}
                    disabled={platform !== NETWORKS.FACEBOOK}
                    onClick={() => togglePostingPlatform(platform)}
                  >
                    {networkLabels[platform]}
                    {platform !== NETWORKS.FACEBOOK && " (bientot)"}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-primary">Duree</p>
              <div className="mt-3 flex gap-3">
                {durationOptions.map((duration) => (
                  <button
                    key={duration}
                    type="button"
                    className={cn(
                      "rounded-full border px-4 py-2 text-sm",
                      selectedDuration === duration
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border text-primary/60",
                    )}
                    onClick={() => setSelectedDuration(duration)}
                  >
                    {duration} semaines
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-secondary/60 p-5 text-primary">
            <p className="text-sm text-primary/60">Recapitulatif</p>
            <p className="mt-2 text-lg font-semibold">
              {selectedCadence} posts/sem x {selectedPlatforms.length} reseaux x{" "}
              {selectedDuration} semaines = {totalPosts} posts
            </p>
            <p className="mt-1 text-sm text-primary/70">
              Pack Essentiel {estimatedPrice.toLocaleString("fr-FR")} FCFA
            </p>
          </div>

          <div className="flex justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={() => goToStep(ONBOARDING_STEPS.EDITORIAL_PROFILE)}
            >
              Retour
            </Button>
            <Button type="button" onClick={saveCadence}>
              Continuer
            </Button>
          </div>
        </section>
      )}

      {currentStep === ONBOARDING_STEPS.PHOTOS && (
        <section className="space-y-6 rounded-3xl border border-border bg-card p-8 shadow-sm">
          <div>
            <p className="text-sm text-primary/60">
              Ajoute tes photos pour un contenu plus authentique. Le shell stocke
              pour l'instant le volume uniquement, pas encore les assets definitifs.
            </p>
          </div>
          <label className="flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-secondary/40 p-8 text-center">
            <input
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={(event) =>
                setPhotoFiles(Array.from(event.target.files ?? []))
              }
            />
            <p className="text-lg font-medium text-primary">
              Depose tes photos ou clique pour choisir
            </p>
            <p className="mt-2 text-sm text-primary/60">
              1 a 50 photos. Tu pourras en ajouter plus tard.
            </p>
          </label>
          {photoFiles.length > 0 && (
            <div className="grid gap-3 md:grid-cols-2">
              {photoFiles.slice(0, 6).map((file) => (
                <div
                  key={file.name}
                  className="rounded-2xl border border-border bg-secondary/40 p-4 text-sm text-primary/70"
                >
                  <p className="font-medium text-primary">{file.name}</p>
                  <p className="mt-2 text-xs">
                    Tags a venir: equipe, coulisses, avant/apres
                  </p>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={() => goToStep(ONBOARDING_STEPS.CADENCE)}
            >
              Retour
            </Button>
            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={savePhotos}>
                Passer cette etape
              </Button>
              <Button type="button" onClick={savePhotos}>
                Continuer
              </Button>
            </div>
          </div>
        </section>
      )}

      {currentStep === ONBOARDING_STEPS.PAYMENT && (
        <section className="space-y-6 rounded-3xl border border-border bg-card p-8 shadow-sm">
          <div className="rounded-2xl bg-secondary/60 p-5">
            <p className="text-sm text-primary/60">Ton pack</p>
            <p className="mt-2 text-xl font-semibold text-primary">
              {totalPosts} posts pour {selectedDuration} semaines
            </p>
            <p className="mt-1 text-sm text-primary/70">
              {selectedCadence} posts/semaine, {selectedPlatforms.length} reseau(x)
            </p>
            <p className="mt-3 text-lg font-semibold text-primary">
              {estimatedPrice.toLocaleString("fr-FR")} FCFA
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <ChoiceCard
              title="Mobile Money"
              description="Orange Money / MTN MoMo"
              active={user.paymentMethod === PAYMENT_METHODS.MOBILE_MONEY}
              onClick={() => savePayment(PAYMENT_METHODS.MOBILE_MONEY)}
            />
            <ChoiceCard
              title="Carte bancaire"
              description="Paiement Stripe"
              active={user.paymentMethod === PAYMENT_METHODS.CARD}
              onClick={() => savePayment(PAYMENT_METHODS.CARD)}
            />
          </div>
          <div className="flex justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={() => goToStep(ONBOARDING_STEPS.PHOTOS)}
            >
              Retour
            </Button>
          </div>
        </section>
      )}

      {currentStep === ONBOARDING_STEPS.GENERATING && (
        <section className="space-y-6 rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
          <div className="mx-auto max-w-xl">
            <h2 className="text-2xl font-semibold text-primary">
              Ton calendrier prend forme
            </h2>
            <p className="mt-3 text-sm text-primary/60">
              Redaction des posts, creation des visuels et optimisation des
              horaires. Cet ecran simule deja le moment de magie du produit.
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
        </section>
      )}
    </div>
  );
}

function NetworkCard({
  title,
  description,
  active,
  disabled,
  loading,
  onClick,
}: {
  title: string;
  description: string;
  active: boolean;
  disabled: boolean;
  loading?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-3xl border p-6 text-left transition",
        active ? "border-primary bg-primary/5" : "border-border bg-card",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <p className="text-xl font-semibold text-primary">{title}</p>
      {loading && <Loader2 className="mt-3 h-4 w-4 animate-spin text-primary/60" />}
      <p className="mt-2 text-sm text-primary/60">{description}</p>
    </button>
  );
}

function ChoiceCard({
  title,
  description,
  active,
  loading,
  onClick,
}: {
  title: string;
  description?: string;
  active: boolean;
  loading?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "rounded-2xl border p-5 text-left transition",
        active ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
      )}
      onClick={onClick}
    >
      <p className="font-semibold text-primary">{title}</p>
      {loading && <Loader2 className="mt-2 h-4 w-4 animate-spin text-primary/60" />}
      {description && <p className="mt-2 text-sm text-primary/60">{description}</p>}
    </button>
  );
}
