import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { convexQuery, useConvexAction } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { Button } from "@/ui/button";
import { CreditCard, Loader2, Coins, ArrowUpRight, ArrowDownRight } from "lucide-react";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/credits",
)({
  component: CreditsPage,
  beforeLoad: () => ({
    title: "SocialPulse - Crédits",
    headerTitle: "Crédits",
    headerDescription: "Achetez et gérez vos crédits de publication.",
  }),
});

function CreditsPage() {
  const { data: user } = useQuery(convexQuery(api.app.getCurrentUser, {}));
  const { data: packs } = useQuery(convexQuery(api.credits.getCreditPacks, {}));
  const { data: balanceData } = useQuery(
    convexQuery(api.credits.getCreditBalance, {}),
  );
  const { data: historyData } = useQuery(
    convexQuery(api.credits.getTransactionHistory, {
      paginationOpts: { numItems: 20, cursor: null },
    }),
  );

  const { mutateAsync: createCheckout, isPending } = useMutation({
    mutationFn: useConvexAction(api.credits.createCreditsCheckout),
  });

  const [loadingPackId, setLoadingPackId] = useState<string | null>(null);

  const balance =
    (balanceData as { balance?: number } | null)?.balance ??
    user?.creditsBalance ??
    0;

  const handleBuy = async (packId: string) => {
    setLoadingPackId(packId);
    try {
      const url = await createCheckout({ packId });
      if (url) window.location.href = url;
    } finally {
      setLoadingPackId(null);
    }
  };

  if (!user || !packs) return null;

  const transactions = historyData?.page ?? [];

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
      {/* Balance */}
      <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
          <Coins className="h-6 w-6 text-primary" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Solde actuel</p>
          <p className="text-3xl font-bold text-primary">{balance} crédits</p>
        </div>
      </div>

      {/* Packs */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-primary">
          Acheter des crédits
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {packs.map((pack) => (
            <div
              key={pack.id}
              className={`relative flex flex-col rounded-xl border bg-card p-6 ${
                "popular" in pack && pack.popular
                  ? "border-primary shadow-sm"
                  : "border-border"
              }`}
            >
              {"popular" in pack && pack.popular && (
                <span className="absolute -top-3 left-4 rounded-full bg-primary px-3 py-0.5 text-xs font-medium text-primary-foreground">
                  Populaire
                </span>
              )}
              <h3 className="text-lg font-semibold text-primary">{pack.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {pack.description}
              </p>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-3xl font-bold text-primary">
                  {pack.priceEUR / 100}€
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {pack.credits} crédits •{" "}
                {(pack.priceEUR / 100 / pack.credits).toFixed(2)}€/crédit
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {pack.priceFCFA.toLocaleString()} FCFA
              </p>
              <Button
                className="mt-4 w-full"
                onClick={() => handleBuy(pack.id)}
                disabled={isPending}
              >
                {loadingPackId === pack.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <CreditCard className="mr-2 h-4 w-4" />
                    Acheter
                  </>
                )}
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Transaction History */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-primary">
          Historique des transactions
        </h2>
        <div className="rounded-xl border border-border bg-card">
          {transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <CreditCard className="mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                Aucune transaction pour le moment.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {transactions.map((tx) => (
                <div
                  key={tx._id}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full ${
                        tx.amount > 0
                          ? "bg-green-500/10 text-green-600"
                          : "bg-red-500/10 text-red-600"
                      }`}
                    >
                      {tx.amount > 0 ? (
                        <ArrowUpRight className="h-4 w-4" />
                      ) : (
                        <ArrowDownRight className="h-4 w-4" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-primary">
                        {tx.description}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(tx.createdAt).toLocaleDateString("fr-FR", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p
                      className={`text-sm font-semibold ${
                        tx.amount > 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {tx.amount > 0 ? "+" : ""}
                      {tx.amount} crédits
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Solde: {tx.balanceAfter}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
