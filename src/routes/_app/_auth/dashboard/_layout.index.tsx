import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import {
  IMAGE_SOURCES,
  NETWORKS,
  POST_CATEGORIES,
  type Network,
} from "@cvx/schema";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import siteConfig from "~/site.config";

export const Route = createFileRoute("/_app/_auth/dashboard/_layout/")({
  component: Dashboard,
  beforeLoad: () => ({
    title: `${siteConfig.siteTitle} - Dashboard`,
    headerTitle: "Dashboard",
    headerDescription: "Calendrier editorial genere et pret a etre affine.",
  }),
});

const platformLabel: Record<Network, string> = {
  [NETWORKS.FACEBOOK]: "Facebook",
  [NETWORKS.INSTAGRAM]: "Instagram",
  [NETWORKS.LINKEDIN]: "LinkedIn",
};

const categoryLabel = {
  [POST_CATEGORIES.VALUE]: "Valeur",
  [POST_CATEGORIES.BEHIND_SCENES]: "Coulisses",
  [POST_CATEGORIES.PROMO]: "Promo",
  [POST_CATEGORIES.ENGAGEMENT]: "Engagement",
  [POST_CATEGORIES.TREND]: "Tendance",
};

function formatDateTime(timestamp: number) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function formatDay(timestamp: number) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(timestamp));
}

export default function Dashboard() {
  const { data: calendar } = useQuery(
    convexQuery(api.calendar.getCurrentCalendar, {}),
  );
  const { data: posts = [] } = useQuery(
    convexQuery(api.calendar.getCurrentCalendarPosts, {}),
  );

  if (!calendar) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="rounded-3xl border border-border bg-card p-8 shadow-sm">
          <p className="text-sm uppercase tracking-[0.2em] text-primary/50">
            Calendrier editorial
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-primary">
            Aucun calendrier genere pour le moment
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-primary/60">
            Termine l&apos;onboarding pour connecter une page, definir ton profil
            editorial et lancer la generation de ton premier calendrier.
          </p>
        </div>
      </div>
    );
  }

  const postsByDay = posts.reduce<Record<string, typeof posts>>((acc, post) => {
    const key = new Date(post.scheduledAt).toDateString();
    acc[key] ??= [];
    acc[key].push(post);
    return acc;
  }, {});

  const nextPost = posts.find((post) => post.scheduledAt >= Date.now()) ?? posts[0];

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
      <section className="rounded-3xl border border-border bg-card p-8 shadow-sm">
        <p className="text-sm uppercase tracking-[0.2em] text-primary/50">
          Calendrier editorial
        </p>
        <div className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-primary">
              {calendar.title}
            </h1>
            <p className="mt-2 text-sm text-primary/60">
              Canal connecte: {calendar.channel?.name ?? "Page Facebook"} sur{" "}
              {platformLabel[calendar.channel?.platform ?? NETWORKS.FACEBOOK]}
            </p>
          </div>
          <div className="rounded-2xl bg-secondary/60 px-4 py-3 text-sm text-primary/70">
            Prochain post:{" "}
            <span className="font-semibold text-primary">
              {nextPost ? formatDateTime(nextPost.scheduledAt) : "A planifier"}
            </span>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          label="Posts generes"
          value={`${calendar.totalPosts}`}
          description={`${calendar.cadence} posts par semaine`}
        />
        <SummaryCard
          label="Credits estimes"
          value={`${calendar.totalCreditsEstimated}`}
          description="Aucun debit applique a cette etape"
        />
        <SummaryCard
          label="Periode"
          value={`${calendar.platforms.length} reseau(x)`}
          description={`${posts.length} brouillons planifies`}
        />
      </section>

      <section className="space-y-4">
        {Object.entries(postsByDay).map(([dayKey, dayPosts]) => (
          <div
            key={dayKey}
            className="rounded-3xl border border-border bg-card p-6 shadow-sm"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-primary">
                  {formatDay(dayPosts[0].scheduledAt)}
                </h2>
                <p className="mt-1 text-sm text-primary/60">
                  {dayPosts.length} publication(s) prevue(s)
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 xl:grid-cols-2">
              {dayPosts.map((post) => {
                const text =
                  post.textFacebook ??
                  post.textInstagram ??
                  post.textLinkedin ??
                  "";
                return (
                  <article
                    key={post._id}
                    className="rounded-2xl border border-border bg-secondary/30 p-5"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-card px-3 py-1 text-xs font-medium text-primary">
                        {platformLabel[post.platform]}
                      </span>
                      <span className="rounded-full bg-card px-3 py-1 text-xs text-primary/70">
                        {categoryLabel[post.category]}
                      </span>
                      <span className="rounded-full bg-card px-3 py-1 text-xs text-primary/70">
                        {post.imageSource === IMAGE_SOURCES.REAL
                          ? "Photo reelle"
                          : "Visuel IA"}
                      </span>
                    </div>

                    <p className="mt-4 text-sm text-primary/60">
                      {formatDateTime(post.scheduledAt)}
                    </p>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-primary">
                      {text}
                    </p>

                    {!!post.hashtags?.length && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {post.hashtags.map((hashtag) => (
                          <span
                            key={hashtag}
                            className="rounded-full bg-primary/5 px-3 py-1 text-xs text-primary/70"
                          >
                            {hashtag}
                          </span>
                        ))}
                      </div>
                    )}

                    {post.imageAiPrompt && (
                      <p className="mt-4 rounded-xl bg-card p-3 text-xs text-primary/60">
                        Prompt visuel: {post.imageAiPrompt}
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
      <p className="text-sm text-primary/60">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-primary">{value}</p>
      <p className="mt-2 text-sm text-primary/60">{description}</p>
    </div>
  );
}
