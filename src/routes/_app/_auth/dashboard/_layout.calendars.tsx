import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { convexQuery, useConvexMutation } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { Button } from "@/ui/button";
import { cn } from "@/utils/misc";
import {
  Calendar,
  Copy,
  Archive,
  Trash2,
  Play,
  CheckCheck,
  Loader2,
  Eye,
  BarChart3,
} from "lucide-react";
import siteConfig from "~/site.config";

type CalendarItem = {
  _id: string;
  title: string;
  status: "active" | "draft" | "archived";
  cadence: number;
  channelName: string;
  startDate: number;
  endDate: number;
  postsPublished: number;
  postsTotal: number;
  totalPosts: number;
};

type CompareData = {
  a: {
    title: string;
    totalPosts: number;
    publishedPosts: number;
    avgEngagement: number;
    totalEngagement: number;
    cadence: number;
    categories: Record<string, number>;
  } | null;
  b: {
    title: string;
    totalPosts: number;
    publishedPosts: number;
    avgEngagement: number;
    totalEngagement: number;
    cadence: number;
    categories: Record<string, number>;
  } | null;
};

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/calendars",
)({
  component: CalendarsPage,
  beforeLoad: () => ({
    title: `${siteConfig.siteTitle} - Calendriers`,
    headerTitle: "Calendriers",
    headerDescription:
      "Gérez vos calendriers éditoriaux : activer, dupliquer, archiver.",
  }),
});

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(timestamp));
}

const statusConfig = {
  active: {
    label: "Actif",
    color: "bg-green-500/10 text-green-700 border-green-500/30",
    icon: "🟢",
  },
  draft: {
    label: "Brouillon",
    color: "bg-blue-500/10 text-blue-700 border-blue-500/30",
    icon: "📝",
  },
  archived: {
    label: "Archivé",
    color: "bg-gray-500/10 text-gray-600 border-gray-500/30",
    icon: "📦",
  },
} as const;

function CalendarsPage() {
  const { data: rawCalendars = [] } = useQuery(
    convexQuery(api.calendarManagement.listCalendars, {}),
  );
  const calendars = rawCalendars as CalendarItem[];

  const activateFn = useConvexMutation(
    api.calendarManagement.activateCalendar,
  );
  const archiveFn = useConvexMutation(
    api.calendarManagement.archiveCalendar,
  );
  const duplicateFn = useConvexMutation(
    api.calendarManagement.duplicateCalendar,
  );
  const deleteFn = useConvexMutation(
    api.calendarManagement.deleteCalendar,
  );
  const bulkApproveFn = useConvexMutation(api.postWorkflow.bulkApprove);

  const { mutateAsync: activate, isPending: isActivating } = useMutation({
    mutationFn: activateFn,
  });
  const { mutateAsync: archive, isPending: isArchiving } = useMutation({
    mutationFn: archiveFn,
  });
  const { mutateAsync: duplicate, isPending: isDuplicating } = useMutation({
    mutationFn: duplicateFn,
  });
  const { mutateAsync: deleteCal, isPending: isDeleting } = useMutation({
    mutationFn: deleteFn,
  });
  const { mutateAsync: bulkApprove, isPending: isBulkApproving } =
    useMutation({ mutationFn: bulkApproveFn });

  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);

  const isLoading =
    isActivating || isArchiving || isDuplicating || isDeleting || isBulkApproving;

  const toggleCompare = (id: string) => {
    setCompareIds((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length < 2
          ? [...prev, id]
          : [prev[1], id],
    );
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
      {/* Compare bar */}
      {compareIds.length === 2 && (
        <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 p-4">
          <p className="text-sm text-primary">
            2 calendriers sélectionnés pour comparaison
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCompareIds([])}
            >
              Annuler
            </Button>
            <Button
              size="sm"
              onClick={() => setShowCompare(true)}
              className="gap-2"
            >
              <BarChart3 className="h-4 w-4" />
              Comparer
            </Button>
          </div>
        </div>
      )}

      {/* Compare modal */}
      {showCompare && compareIds.length === 2 && (
        <CompareView
          calendarIdA={compareIds[0] as string}
          calendarIdB={compareIds[1] as string}
          onClose={() => {
            setShowCompare(false);
            setCompareIds([]);
          }}
        />
      )}

      {/* Calendar list */}
      {calendars.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card p-16 text-center">
          <Calendar className="mb-4 h-12 w-12 text-muted-foreground/40" />
          <p className="text-lg font-medium text-primary">
            Aucun calendrier
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Complétez l'onboarding pour générer votre premier calendrier.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {calendars.map((cal) => {
            const cfg = statusConfig[cal.status] ?? statusConfig.draft;
            const isSelected = compareIds.includes(cal._id);

            return (
              <div
                key={cal._id}
                className={cn(
                  "rounded-xl border bg-card transition",
                  isSelected ? "border-primary" : "border-border",
                )}
              >
                <div className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{cfg.icon}</span>
                      <h3 className="text-lg font-semibold text-primary">
                        {cal.title}
                      </h3>
                      <span
                        className={cn(
                          "rounded-full border px-2 py-0.5 text-xs",
                          cfg.color,
                        )}
                      >
                        {cfg.label}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-4 text-sm text-primary/60">
                      <span>
                        {cal.cadence} posts/sem • {cal.channelName}
                      </span>
                      <span>
                        {formatDate(cal.startDate)} → {formatDate(cal.endDate)}
                      </span>
                      <span>
                        {cal.postsPublished}/{cal.postsTotal} publiés
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {/* Compare checkbox */}
                    <Button
                      variant={isSelected ? "default" : "outline"}
                      size="sm"
                      onClick={() => toggleCompare(cal._id)}
                      className="gap-1"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      {isSelected ? "Sélectionné" : "Comparer"}
                    </Button>

                    {/* Actions by status */}
                    {cal.status === "draft" && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isLoading}
                          onClick={() =>
                            activate({ calendarId: cal._id as any })
                          }
                          className="gap-1"
                        >
                          <Play className="h-3.5 w-3.5" />
                          Activer
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isLoading}
                          onClick={() =>
                            bulkApprove({ calendarId: cal._id as any })
                          }
                          className="gap-1"
                        >
                          <CheckCheck className="h-3.5 w-3.5" />
                          Tout valider
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isLoading}
                          onClick={() => {
                            if (
                              confirm(
                                `Supprimer "${cal.title}" et ses ${cal.postsTotal} posts ?`,
                              )
                            ) {
                              deleteCal({ calendarId: cal._id as any });
                            }
                          }}
                          className="gap-1 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}

                    {cal.status === "active" && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isLoading}
                          onClick={() =>
                            bulkApprove({ calendarId: cal._id as any })
                          }
                          className="gap-1"
                        >
                          <CheckCheck className="h-3.5 w-3.5" />
                          Tout valider
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isLoading}
                          onClick={() =>
                            archive({ calendarId: cal._id as any })
                          }
                          className="gap-1"
                        >
                          <Archive className="h-3.5 w-3.5" />
                          Archiver
                        </Button>
                      </>
                    )}

                    {cal.status === "archived" && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isLoading}
                        onClick={() =>
                          duplicate({ calendarId: cal._id as any })
                        }
                        className="gap-1"
                      >
                        {isDuplicating ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        Dupliquer
                      </Button>
                    )}

                    {/* Always available: duplicate */}
                    {cal.status !== "archived" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isLoading}
                        onClick={() =>
                          duplicate({ calendarId: cal._id as any })
                        }
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                <div className="border-t border-border px-6 py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-primary/10">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{
                          width: `${cal.postsTotal > 0 ? (cal.postsPublished / cal.postsTotal) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <span className="text-xs text-primary/50">
                      {cal.postsTotal > 0
                        ? Math.round(
                            (cal.postsPublished / cal.postsTotal) * 100,
                          )
                        : 0}
                      %
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CompareView({
  calendarIdA,
  calendarIdB,
  onClose,
}: {
  calendarIdA: string;
  calendarIdB: string;
  onClose: () => void;
}) {
  const { data: rawData } = useQuery(
    convexQuery(api.calendarManagement.compareCalendars, {
      calendarIdA: calendarIdA as any,
      calendarIdB: calendarIdB as any,
    }),
  );
  const data = rawData as CompareData | null | undefined;

  if (!data?.a || !data?.b) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary/60" />
      </div>
    );
  }

  const metrics = [
    { label: "Posts total", a: data.a.totalPosts, b: data.b.totalPosts },
    {
      label: "Posts publiés",
      a: data.a.publishedPosts,
      b: data.b.publishedPosts,
    },
    {
      label: "Engagement moyen",
      a: data.a.avgEngagement,
      b: data.b.avgEngagement,
    },
    {
      label: "Engagement total",
      a: data.a.totalEngagement,
      b: data.b.totalEngagement,
    },
    { label: "Cadence", a: data.a.cadence, b: data.b.cadence },
  ];

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-primary">Comparaison</h3>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Fermer
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
        <div className="font-medium text-primary/60">Métrique</div>
        <div className="text-center font-medium text-primary">
          {data.a.title}
        </div>
        <div className="text-center font-medium text-primary">
          {data.b.title}
        </div>

        {metrics.map((m) => {
          const better =
            m.a > m.b ? "a" : m.b > m.a ? "b" : null;
          return (
            <>
              <div key={m.label} className="text-primary/60">
                {m.label}
              </div>
              <div
                className={cn(
                  "text-center font-semibold",
                  better === "a" ? "text-green-600" : "text-primary",
                )}
              >
                {m.a}
              </div>
              <div
                className={cn(
                  "text-center font-semibold",
                  better === "b" ? "text-green-600" : "text-primary",
                )}
              >
                {m.b}
              </div>
            </>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div className="rounded-xl bg-secondary/60 p-4">
          <p className="text-xs text-primary/60">Catégories — {data.a.title}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {Object.entries(data.a.categories).map(([cat, count]) => (
              <span
                key={cat}
                className="rounded-full bg-card px-2 py-0.5 text-xs text-primary/70"
              >
                {cat}: {count as number}
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-xl bg-secondary/60 p-4">
          <p className="text-xs text-primary/60">Catégories — {data.b.title}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {Object.entries(data.b.categories).map(([cat, count]) => (
              <span
                key={cat}
                className="rounded-full bg-card px-2 py-0.5 text-xs text-primary/70"
              >
                {cat}: {count as number}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
