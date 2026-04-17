import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { NETWORKS, POST_CATEGORIES, type Network } from "@cvx/schema";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Calendar,
  CreditCard,
  ImageIcon,
  Share2,
  Clock,
  Plus,
  ArrowRight,
} from "lucide-react";
import siteConfig from "~/site.config";

export const Route = createFileRoute("/_app/_auth/dashboard/_layout/")({
  component: Dashboard,
  beforeLoad: () => ({
    title: `${siteConfig.siteTitle} - Dashboard`,
    headerTitle: "Dashboard",
    headerDescription: "Vue d'ensemble de votre activité SocialPulse.",
  }),
});

const platformLabel: Record<Network, string> = {
  [NETWORKS.FACEBOOK]: "Facebook",
  [NETWORKS.INSTAGRAM]: "Instagram",
  [NETWORKS.LINKEDIN]: "LinkedIn",
};

const categoryLabel: Record<string, string> = {
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

export default function Dashboard() {
  const { data: stats } = useQuery(convexQuery(api.dashboard.getStats, {}));

  if (!stats) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="grid auto-rows-min gap-4 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-xl bg-muted/50"
            />
          ))}
        </div>
        <div className="min-h-[40vh] flex-1 animate-pulse rounded-xl bg-muted/50" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard
          icon={<Share2 className="h-5 w-5 text-blue-500" />}
          label="Canaux connectés"
          value={String(stats.channels.length)}
          sub={
            stats.channels.length > 0
              ? stats.channels.map((c: { name: string }) => c.name).join(", ")
              : "Aucun canal"
          }
        />
        <KpiCard
          icon={<CreditCard className="h-5 w-5 text-emerald-500" />}
          label="Crédits"
          value={String(stats.credits.balance)}
          sub={
            stats.credits.weeksLeft > 0
              ? `≈ ${stats.credits.weeksLeft} semaines`
              : "Rechargez"
          }
          href="/dashboard/credits"
        />
        <KpiCard
          icon={<Calendar className="h-5 w-5 text-violet-500" />}
          label="Cette semaine"
          value={`${stats.thisWeek.total} posts`}
          sub={`${stats.thisWeek.published} publiés, ${stats.thisWeek.upcoming} à venir`}
        />
        <KpiCard
          icon={<ImageIcon className="h-5 w-5 text-amber-500" />}
          label="Banque photos"
          value={String(stats.photoCount)}
          sub="photos importées"
        />
      </div>

      <section className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary/60" />
            <h2 className="font-semibold text-primary">Prochains posts</h2>
          </div>
          {stats.calendar && (
            <span className="text-xs text-primary/50">
              {stats.calendar.title}
            </span>
          )}
        </div>

        {stats.upcomingPosts.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <Plus className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              Aucun post planifié.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {stats.calendar
                ? "Tous les posts ont été publiés."
                : "Complétez l'onboarding pour générer votre calendrier."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {stats.upcomingPosts.map(
              (post: {
                id: string;
                text: string;
                platform: Network;
                category: string;
                scheduledAt: number;
                imageUrl?: string;
              }) => (
                <div key={post.id} className="flex items-start gap-4 p-4">
                  {post.imageUrl ? (
                    <img
                      src={post.imageUrl}
                      alt=""
                      className="h-14 w-14 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-muted">
                      <ImageIcon className="h-6 w-6 text-muted-foreground/40" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-primary/70">
                        {platformLabel[post.platform]}
                      </span>
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-primary/70">
                        {categoryLabel[post.category] ?? post.category}
                      </span>
                      <span className="text-xs text-primary/50">
                        {formatDateTime(post.scheduledAt)}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm text-primary/80">
                      {post.text || "Post sans texte"}
                    </p>
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <QuickAction
          icon={<CreditCard className="h-5 w-5" />}
          title="Recharger mes crédits"
          description={`${stats.credits.balance} crédits restants`}
          href="/dashboard/credits"
        />
        <QuickAction
          icon={<Share2 className="h-5 w-5" />}
          title="Gérer mes canaux"
          description={`${stats.channels.length} connecté(s)`}
          href="/dashboard/settings"
        />
        <QuickAction
          icon={<Calendar className="h-5 w-5" />}
          title="Voir le calendrier"
          description={
            stats.calendar
              ? `${stats.calendar.totalPosts} posts planifiés`
              : "Pas de calendrier"
          }
          href="/dashboard"
        />
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  href?: string;
}) {
  const content = (
    <div className="rounded-xl border border-border bg-card p-4 transition hover:border-primary/20">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm text-primary/60">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold text-primary">{value}</p>
      <p className="mt-0.5 text-xs text-primary/50">{sub}</p>
    </div>
  );
  if (href) return <Link to={href}>{content}</Link>;
  return content;
}

function QuickAction({
  icon,
  title,
  description,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      to={href}
      className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition hover:border-primary/30"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
        {icon}
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium text-primary">{title}</p>
        <p className="text-xs text-primary/50">{description}</p>
      </div>
      <ArrowRight className="h-4 w-4 text-primary/30" />
    </Link>
  );
}
