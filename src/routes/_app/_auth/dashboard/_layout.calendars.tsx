import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  convexQuery,
  useConvexMutation,
  useConvexAction,
} from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { Button } from "@/ui/button";
import { cn } from "@/utils/misc";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  CheckCircle2,
  Clock,
  AlertCircle,
  Send,
  FileEdit,
  Trash2,
  RotateCcw,
  ImageIcon,
  Sparkles,
  Loader2,
} from "lucide-react";
import siteConfig from "~/site.config";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/calendars",
)({
  component: CalendarPage,
  beforeLoad: () => ({
    title: `${siteConfig.siteTitle} - Calendrier`,
    headerTitle: "Calendrier",
    headerDescription: "Visualisez et gérez vos publications planifiées.",
  }),
});

type ViewMode = "week" | "month" | "year";

type Post = {
  _id: string;
  platform: string;
  textFacebook?: string;
  textInstagram?: string;
  textLinkedin?: string;
  hashtags?: string[];
  imageUrl?: string;
  imageAiPrompt?: string;
  imageSource: string;
  category: string;
  scheduledAt: number;
  status: string;
  creditsConsumed: number;
};

type CalendarData = {
  _id: string;
  title: string;
  status: string;
  cadence: number;
  totalPosts: number;
  startDate: number;
  endDate: number;
  platforms: string[];
  channel?: { name?: string; platform?: string } | null;
};

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; icon: typeof Clock }
> = {
  draft: {
    label: "Brouillon",
    color: "text-blue-600",
    bg: "bg-blue-500",
    icon: FileEdit,
  },
  approved: {
    label: "Validé",
    color: "text-amber-600",
    bg: "bg-amber-500",
    icon: CheckCircle2,
  },
  scheduled: {
    label: "Planifié",
    color: "text-orange-600",
    bg: "bg-orange-500",
    icon: Clock,
  },
  published: {
    label: "Publié",
    color: "text-green-600",
    bg: "bg-green-500",
    icon: Send,
  },
  failed: {
    label: "Échoué",
    color: "text-red-600",
    bg: "bg-red-500",
    icon: AlertCircle,
  },
};

const CATEGORY_LABELS: Record<string, string> = {
  value: "Valeur",
  behind_scenes: "Coulisses",
  promo: "Promo",
  engagement: "Engagement",
  trend: "Tendance",
};

const DAYS_FR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MONTHS_FR = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatTime(ts: number): string {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts));
}

function formatDateShort(ts: number): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
  }).format(new Date(ts));
}

function CalendarPage() {
  const { data: rawCalendar } = useQuery(
    convexQuery(api.calendar.getCurrentCalendar, {}),
  );
  const { data: rawPosts = [] } = useQuery(
    convexQuery(api.calendar.getCurrentCalendarPosts, {}),
  );

  const calendar = rawCalendar as CalendarData | null | undefined;
  const posts = rawPosts as Post[];

  const approveFn = useConvexMutation(api.postWorkflow.approvePost);
  const revertFn = useConvexMutation(api.postWorkflow.revertToDraft);
  const retryFn = useConvexMutation(api.postWorkflow.retryFailedPost);
  const deletePostFn = useConvexMutation(api.postWorkflow.deletePost);
  const bulkApproveFn = useConvexMutation(api.postWorkflow.bulkApprove);
  const createDraftFn = useConvexMutation(api.calendar.createDraftPost);
  const generateImagesFn = useConvexAction(
    api.imageGeneration.generateImagesForCalendar,
  );

  const { mutateAsync: approve } = useMutation({ mutationFn: approveFn });
  const { mutateAsync: revert } = useMutation({ mutationFn: revertFn });
  const { mutateAsync: retry } = useMutation({ mutationFn: retryFn });
  const { mutateAsync: deletePost } = useMutation({
    mutationFn: deletePostFn,
  });
  const { mutateAsync: bulkApprove } = useMutation({
    mutationFn: bulkApproveFn,
  });
  const { mutateAsync: createDraft } = useMutation({
    mutationFn: createDraftFn,
  });
  const { mutateAsync: generateImages, isPending: isGeneratingImages } =
    useMutation({ mutationFn: generateImagesFn });

  const [view, setView] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);

  if (!calendar) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <Calendar className="h-16 w-16 text-muted-foreground/30" />
        <h2 className="text-xl font-semibold text-primary">
          Aucun calendrier
        </h2>
        <p className="text-sm text-muted-foreground">
          Complétez l'onboarding pour générer votre premier calendrier.
        </p>
      </div>
    );
  }

  const pendingImages = posts.filter(
    (p) => p.imageSource === "ai" && !p.imageUrl && p.imageAiPrompt,
  ).length;
  const draftCount = posts.filter((p) => p.status === "draft").length;

  const navigate = (delta: number) => {
    if (view === "week") setCurrentDate(addDays(currentDate, delta * 7));
    else if (view === "month")
      setCurrentDate(
        new Date(
          currentDate.getFullYear(),
          currentDate.getMonth() + delta,
          1,
        ),
      );
    else
      setCurrentDate(
        new Date(currentDate.getFullYear() + delta, 0, 1),
      );
  };

  const headerLabel =
    view === "week"
      ? (() => {
          const ws = startOfWeek(currentDate);
          const we = addDays(ws, 6);
          return `${formatDateShort(ws.getTime())} — ${formatDateShort(we.getTime())} ${we.getFullYear()}`;
        })()
      : view === "month"
        ? `${MONTHS_FR[currentDate.getMonth()]} ${currentDate.getFullYear()}`
        : `${currentDate.getFullYear()}`;

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-lg p-1.5 hover:bg-secondary"
          >
            <ChevronLeft className="h-5 w-5 text-primary/60" />
          </button>
          <h2 className="min-w-48 text-center text-sm font-semibold text-primary">
            {headerLabel}
          </h2>
          <button
            type="button"
            onClick={() => navigate(1)}
            className="rounded-lg p-1.5 hover:bg-secondary"
          >
            <ChevronRight className="h-5 w-5 text-primary/60" />
          </button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentDate(new Date())}
          >
            Aujourd'hui
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggles */}
          <div className="flex rounded-lg border border-border">
            {(["week", "month", "year"] as const).map((v) => (
              <button
                key={v}
                type="button"
                className={cn(
                  "px-3 py-1.5 text-xs font-medium transition",
                  view === v
                    ? "bg-primary text-primary-foreground"
                    : "text-primary/60 hover:text-primary",
                )}
                onClick={() => setView(v)}
              >
                {v === "week" ? "Semaine" : v === "month" ? "Mois" : "Année"}
              </button>
            ))}
          </div>

          {/* Actions */}
          {draftCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                bulkApprove({ calendarId: calendar._id as any })
              }
            >
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
              Tout valider ({draftCount})
            </Button>
          )}
          {pendingImages > 0 && (
            <Button
              variant="outline"
              size="sm"
              disabled={isGeneratingImages}
              onClick={() =>
                generateImages({ calendarId: calendar._id as any })
              }
            >
              {isGeneratingImages ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              )}
              Générer images ({pendingImages})
            </Button>
          )}
        </div>
      </div>

      {/* Calendar views */}
      {view === "week" && (
        <WeekView
          posts={posts}
          currentDate={currentDate}
          onSelectPost={setSelectedPost}
          onCreatePost={(ts) =>
            createDraft({ scheduledAt: ts })
          }
        />
      )}
      {view === "month" && (
        <MonthView
          posts={posts}
          currentDate={currentDate}
          onDayClick={(date) => {
            setCurrentDate(date);
            setView("week");
          }}
        />
      )}
      {view === "year" && (
        <YearView
          posts={posts}
          currentDate={currentDate}
          onMonthClick={(date) => {
            setCurrentDate(date);
            setView("month");
          }}
        />
      )}

      {/* Post detail panel */}
      {selectedPost && (
        <PostDetailPanel
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
          onApprove={() => {
            approve({ postId: selectedPost._id as any });
            setSelectedPost(null);
          }}
          onRevert={() => {
            revert({ postId: selectedPost._id as any });
            setSelectedPost(null);
          }}
          onRetry={() => {
            retry({ postId: selectedPost._id as any });
            setSelectedPost(null);
          }}
          onDelete={() => {
            deletePost({ postId: selectedPost._id as any });
            setSelectedPost(null);
          }}
          onGenerateImage={() =>
            generateImages({ calendarId: calendar._id as any })
          }
          isGeneratingImages={isGeneratingImages}
        />
      )}
    </div>
  );
}

// ==========================================================================
// Week View
// ==========================================================================

function WeekView({
  posts,
  currentDate,
  onSelectPost,
  onCreatePost,
}: {
  posts: Post[];
  currentDate: Date;
  onSelectPost: (p: Post) => void;
  onCreatePost: (ts: number) => void;
}) {
  const weekStart = startOfWeek(currentDate);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = new Date();

  return (
    <div className="grid grid-cols-7 gap-1 rounded-xl border border-border bg-card">
      {/* Day headers */}
      {days.map((day, i) => (
        <div
          key={i}
          className={cn(
            "border-b border-border px-2 py-2 text-center text-xs",
            isSameDay(day, today)
              ? "bg-primary/5 font-semibold text-primary"
              : "text-primary/50",
          )}
        >
          <div>{DAYS_FR[i]}</div>
          <div className="text-lg font-semibold">{day.getDate()}</div>
        </div>
      ))}

      {/* Day columns */}
      {days.map((day, i) => {
        const dayPosts = posts
          .filter((p) => isSameDay(new Date(p.scheduledAt), day))
          .sort((a, b) => a.scheduledAt - b.scheduledAt);

        return (
          <div
            key={i}
            className={cn(
              "min-h-32 p-1",
              isSameDay(day, today) && "bg-primary/5",
            )}
          >
            {dayPosts.map((post) => {
              const cfg = STATUS_CONFIG[post.status] ?? STATUS_CONFIG.draft;
              const text =
                post.textFacebook ??
                post.textInstagram ??
                post.textLinkedin ??
                "";
              return (
                <button
                  key={post._id}
                  type="button"
                  onClick={() => onSelectPost(post)}
                  className="mb-1 w-full rounded-lg border border-border bg-card p-1.5 text-left transition hover:border-primary/40 hover:shadow-sm"
                >
                  <div className="flex items-center gap-1">
                    <div
                      className={cn("h-2 w-2 rounded-full", cfg.bg)}
                    />
                    <span className="text-[10px] text-primary/50">
                      {formatTime(post.scheduledAt)}
                    </span>
                    <span className="text-[10px] text-primary/40">
                      {post.platform === "facebook"
                        ? "FB"
                        : post.platform === "instagram"
                          ? "IG"
                          : "LI"}
                    </span>
                  </div>
                  {post.imageUrl && (
                    <img
                      src={post.imageUrl}
                      alt=""
                      className="mt-1 h-12 w-full rounded object-cover"
                    />
                  )}
                  <p className="mt-1 line-clamp-2 text-[11px] leading-tight text-primary/70">
                    {text.slice(0, 80)}
                  </p>
                </button>
              );
            })}

            {/* Add post button */}
            <button
              type="button"
              onClick={() => {
                const ts = new Date(day);
                ts.setHours(10, 0, 0, 0);
                onCreatePost(ts.getTime());
              }}
              className="flex w-full items-center justify-center rounded-lg border border-dashed border-border/50 p-1 text-primary/20 transition hover:border-primary/30 hover:text-primary/50"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ==========================================================================
// Month View
// ==========================================================================

function MonthView({
  posts,
  currentDate,
  onDayClick,
}: {
  posts: Post[];
  currentDate: Date;
  onDayClick: (date: Date) => void;
}) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const totalDays = lastDay.getDate();
  const today = new Date();

  const cells: Array<{ date: Date | null; posts: Post[] }> = [];

  for (let i = 0; i < startOffset; i++) cells.push({ date: null, posts: [] });
  for (let d = 1; d <= totalDays; d++) {
    const date = new Date(year, month, d);
    const dayPosts = posts.filter((p) =>
      isSameDay(new Date(p.scheduledAt), date),
    );
    cells.push({ date, posts: dayPosts });
  }
  while (cells.length % 7 !== 0) cells.push({ date: null, posts: [] });

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="grid grid-cols-7 border-b border-border">
        {DAYS_FR.map((d) => (
          <div
            key={d}
            className="py-2 text-center text-xs font-medium text-primary/50"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((cell, i) => (
          <button
            key={i}
            type="button"
            disabled={!cell.date}
            onClick={() => cell.date && onDayClick(cell.date)}
            className={cn(
              "min-h-20 border-b border-r border-border p-1.5 text-left transition",
              !cell.date && "bg-secondary/30",
              cell.date &&
                isSameDay(cell.date, today) &&
                "bg-primary/5",
              cell.date && "hover:bg-secondary/50",
            )}
          >
            {cell.date && (
              <>
                <span
                  className={cn(
                    "text-xs",
                    isSameDay(cell.date, today)
                      ? "font-bold text-primary"
                      : "text-primary/60",
                  )}
                >
                  {cell.date.getDate()}
                </span>
                <div className="mt-1 flex flex-wrap gap-0.5">
                  {cell.posts.map((p) => {
                    const cfg =
                      STATUS_CONFIG[p.status] ?? STATUS_CONFIG.draft;
                    return (
                      <div
                        key={p._id}
                        className={cn("h-2 w-2 rounded-full", cfg.bg)}
                        title={`${formatTime(p.scheduledAt)} — ${cfg.label}`}
                      />
                    );
                  })}
                </div>
                {cell.posts.length > 0 && (
                  <p className="mt-0.5 text-[10px] text-primary/40">
                    {cell.posts.length} post{cell.posts.length > 1 ? "s" : ""}
                  </p>
                )}
              </>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ==========================================================================
// Year View
// ==========================================================================

function YearView({
  posts,
  currentDate,
  onMonthClick,
}: {
  posts: Post[];
  currentDate: Date;
  onMonthClick: (date: Date) => void;
}) {
  const year = currentDate.getFullYear();

  return (
    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {MONTHS_FR.map((name, monthIndex) => {
        const monthPosts = posts.filter((p) => {
          const d = new Date(p.scheduledAt);
          return (
            d.getFullYear() === year && d.getMonth() === monthIndex
          );
        });
        const published = monthPosts.filter(
          (p) => p.status === "published",
        ).length;
        const total = monthPosts.length;
        const pct = total > 0 ? (published / total) * 100 : 0;

        return (
          <button
            key={monthIndex}
            type="button"
            onClick={() => onMonthClick(new Date(year, monthIndex, 1))}
            className="rounded-xl border border-border bg-card p-4 text-left transition hover:border-primary/30"
          >
            <p className="text-sm font-semibold text-primary">{name}</p>
            <p className="mt-1 text-2xl font-bold text-primary">{total}</p>
            <p className="text-xs text-primary/50">
              {published} publiés
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-primary/10">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ==========================================================================
// Post Detail Panel
// ==========================================================================

function PostDetailPanel({
  post,
  onClose,
  onApprove,
  onRevert,
  onRetry,
  onDelete,
  onGenerateImage,
  isGeneratingImages,
}: {
  post: Post;
  onClose: () => void;
  onApprove: () => void;
  onRevert: () => void;
  onRetry: () => void;
  onDelete: () => void;
  onGenerateImage: () => void;
  isGeneratingImages: boolean;
}) {
  const cfg = STATUS_CONFIG[post.status] ?? STATUS_CONFIG.draft;
  const StatusIcon = cfg.icon;
  const text =
    post.textFacebook ?? post.textInstagram ?? post.textLinkedin ?? "";

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-card shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border p-4">
        <div className="flex items-center gap-2">
          <StatusIcon className={cn("h-4 w-4", cfg.color)} />
          <span className={cn("text-sm font-medium", cfg.color)}>
            {cfg.label}
          </span>
          <span className="text-xs text-primary/40">
            {post.platform === "facebook"
              ? "Facebook"
              : post.platform === "instagram"
                ? "Instagram"
                : "LinkedIn"}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 hover:bg-secondary"
        >
          <X className="h-5 w-5 text-primary/50" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Date */}
        <div className="flex items-center gap-2 text-sm text-primary/60">
          <Clock className="h-4 w-4" />
          {new Intl.DateTimeFormat("fr-FR", {
            weekday: "long",
            day: "numeric",
            month: "long",
            hour: "2-digit",
            minute: "2-digit",
          }).format(new Date(post.scheduledAt))}
        </div>

        {/* Category */}
        <div className="mt-3">
          <span className="rounded-full bg-secondary px-2.5 py-1 text-xs text-primary/70">
            {CATEGORY_LABELS[post.category] ?? post.category}
          </span>
        </div>

        {/* Image */}
        <div className="mt-4">
          {post.imageUrl ? (
            <img
              src={post.imageUrl}
              alt=""
              className="w-full rounded-xl object-cover"
            />
          ) : post.imageAiPrompt ? (
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-secondary/30 p-8 text-center">
              <ImageIcon className="mb-2 h-8 w-8 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">
                Image à générer
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground/60">
                {post.imageAiPrompt}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 gap-1.5"
                disabled={isGeneratingImages}
                onClick={onGenerateImage}
              >
                {isGeneratingImages ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                Générer l'image
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-center rounded-xl bg-secondary/30 p-8">
              <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
            </div>
          )}
        </div>

        {/* Text */}
        <div className="mt-4 rounded-xl bg-secondary/40 p-4">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-primary">
            {text || "Aucun texte"}
          </p>
        </div>

        {/* Hashtags */}
        {post.hashtags && post.hashtags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {post.hashtags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-primary/5 px-2 py-0.5 text-xs text-primary/60"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Credits */}
        <p className="mt-3 text-xs text-primary/40">
          Crédits : {post.creditsConsumed} •{" "}
          {post.imageSource === "real"
            ? "Photo réelle"
            : post.imageSource === "ai"
              ? "Image IA"
              : "Image en attente"}
        </p>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 border-t border-border p-4">
        {post.status === "draft" && (
          <>
            <Button size="sm" onClick={onApprove} className="gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Valider
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="gap-1.5 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Supprimer
            </Button>
          </>
        )}
        {post.status === "approved" && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRevert}
            className="gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Retour brouillon
          </Button>
        )}
        {post.status === "failed" && (
          <Button size="sm" onClick={onRetry} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" />
            Réessayer
          </Button>
        )}
      </div>
    </div>
  );
}
