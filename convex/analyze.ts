import { action, internalMutation, internalQuery } from "@cvx/_generated/server";
import { internal } from "@cvx/_generated/api";
import { auth } from "@cvx/auth";
import { v } from "convex/values";
import { ANTHROPIC_API_KEY } from "@cvx/env";
import * as uploadPost from "@cvx/lib/uploadPost";

export interface EditorialProfile {
  sector: string;
  tone: string;
  themes: string[];
  bestHours: string[];
  bestDays: string[];
  audienceProfile: string;
  contentTypes: string[];
  language: string;
  recommendations: string;
  source: "analysis" | "questionnaire";
  generatedAt: number;
}

const ANALYSIS_PROMPT = `Tu es un expert en social media marketing. On te donne les données des derniers posts d'une page Facebook. Analyse-les et retourne un profil éditorial.

Réponds UNIQUEMENT en JSON valide, sans backticks, sans texte avant ou après.

{
  "sector": "secteur d'activité détecté (1-3 mots)",
  "tone": "ton éditorial détecté (2-4 mots)",
  "themes": ["thème 1", "thème 2", "thème 3", "thème 4", "thème 5"],
  "bestHours": ["HH:MM", "HH:MM"],
  "bestDays": ["jour1", "jour2", "jour3"],
  "audienceProfile": "description courte de l'audience (1 phrase)",
  "contentTypes": ["photo", "video", "texte"],
  "language": "fr" ou "en" ou "fr-en",
  "recommendations": "2-3 phrases de recommandations concrètes pour améliorer la stratégie sociale"
}`;

const QUESTIONNAIRE_PROMPT = `Tu es un expert en social media marketing. Génère un profil éditorial basé sur ces informations business.

Réponds UNIQUEMENT en JSON valide, sans backticks.

{
  "sector": "secteur (1-3 mots)",
  "tone": "ton recommandé (2-4 mots)",
  "themes": ["thème 1", "thème 2", "thème 3", "thème 4", "thème 5"],
  "bestHours": ["10:00", "19:00"],
  "bestDays": ["mardi", "jeudi", "samedi"],
  "audienceProfile": "description audience (1 phrase)",
  "contentTypes": ["photo"],
  "language": "fr",
  "recommendations": "2-3 phrases de recommandations"
}`;

async function callClaude(systemPrompt: string, userMessage: string): Promise<string> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API error ${res.status}: ${text}`);
  }
  const data = await res.json() as { content: { type: string; text: string }[] };
  return data.content[0]?.text ?? "";
}

function parseEditorialProfile(raw: string, source: "analysis" | "questionnaire"): EditorialProfile {
  const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const parsed = JSON.parse(cleaned);
  return {
    sector: parsed.sector ?? "Activité locale",
    tone: parsed.tone ?? "Chaleureux",
    themes: parsed.themes ?? [],
    bestHours: parsed.bestHours ?? ["10:00", "19:00"],
    bestDays: parsed.bestDays ?? ["mardi", "jeudi", "samedi"],
    audienceProfile: parsed.audienceProfile ?? "",
    contentTypes: parsed.contentTypes ?? ["photo"],
    language: parsed.language ?? "fr",
    recommendations: parsed.recommendations ?? "",
    source,
    generatedAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export const analyzeChannel = action({
  args: {},
  handler: async (ctx): Promise<{
    profile: EditorialProfile;
    photosImported: number;
    postsAnalyzed: number;
  }> => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("User not found");

    const user = await ctx.runQuery(internal.analyze.getUserForAnalysis, { userId });
    if (!user) throw new Error("User not found");

    const username = user.uploadPostUsername;
    if (!username) throw new Error("No Upload-Post profile linked");

    const pageId = user.selectedFacebookPageId;
    if (!pageId) throw new Error("No Facebook page selected");

    // Fetch recent media from Upload-Post
    let media: uploadPost.MediaItem[] = [];
    try {
      const result = await uploadPost.listMedia({
        platform: "facebook",
        user: username,
      });
      media = (result as unknown as { media: uploadPost.MediaItem[] }).media ?? [];
    } catch {
      media = [];
    }

    // Analyze with Claude if enough posts
    let profile: EditorialProfile;
    const postsWithContent = media.filter((m) => m.caption || m.media_url);

    if (postsWithContent.length >= 5 && ANTHROPIC_API_KEY) {
      const postsData = postsWithContent.slice(0, 20).map((m) => ({
        caption: m.caption ?? "",
        type: m.media_type ?? "IMAGE",
        timestamp: m.timestamp ?? "",
        url: m.permalink ?? "",
      }));

      try {
        const raw = await callClaude(
          ANALYSIS_PROMPT,
          `Page "${user.facebookPages?.find((p: { id: string }) => p.id === pageId)?.name ?? "Facebook"}".\n\nPosts:\n${JSON.stringify(postsData, null, 2)}`,
        );
        profile = parseEditorialProfile(raw, "analysis");
      } catch {
        profile = buildFallbackProfile(user);
      }
    } else if (ANTHROPIC_API_KEY && user.businessCategory) {
      try {
        const raw = await callClaude(
          QUESTIONNAIRE_PROMPT,
          `Activité: ${user.businessCategory}\nClients: ${user.targetAudience ?? "b2c"}\nTon souhaité: ${user.brandTone ?? "warm"}\nLangue: ${user.contentLanguage ?? "fr"}`,
        );
        profile = parseEditorialProfile(raw, "questionnaire");
      } catch {
        profile = buildFallbackProfile(user);
      }
    } else {
      profile = buildFallbackProfile(user);
    }

    // Import photos from Facebook posts
    let photosImported = 0;
    const imageMedia = media
      .filter((m) => m.media_url && (m.media_type === "IMAGE" || m.media_type === "CAROUSEL_ALBUM"))
      .slice(0, 20);

    // Get existing channel
    const channel = await ctx.runQuery(internal.analyze.getChannelByExternalId, {
      platform: "facebook",
      externalId: pageId,
    });

    if (channel) {
      for (const item of imageMedia) {
        if (!item.media_url) continue;
        try {
          const storageId = await ctx.storage.store(
            await fetch(item.media_url).then((r) => r.blob()),
          );
          const url = await ctx.storage.getUrl(storageId);
          if (!url) continue;

          await ctx.runMutation(internal.analyze.insertPhoto, {
            channelId: channel._id,
            userId,
            storageId,
            url,
            filename: `fb-${item.id ?? photosImported}.jpg`,
            fileSizeBytes: 0,
            tags: inferBasicTags(item.caption),
            sourcePostId: item.id,
          });
          photosImported++;
        } catch {
          // skip failed downloads
        }
      }
    }

    // Save editorial profile to user
    await ctx.runMutation(internal.analyze.saveEditorialProfile, {
      userId,
      profile,
    });

    return {
      profile,
      photosImported,
      postsAnalyzed: postsWithContent.length,
    };
  },
});

function buildFallbackProfile(user: {
  businessCategory?: string;
  brandTone?: string;
  targetAudience?: string;
  contentLanguage?: string;
}): EditorialProfile {
  const category = user.businessCategory ?? "Activité locale";
  return {
    sector: category,
    tone: user.brandTone === "professional" ? "Professionnel et rassurant"
      : user.brandTone === "fun" ? "Fun et énergique"
      : user.brandTone === "inspiring" ? "Inspirant et ambitieux"
      : "Chaleureux et accessible",
    themes: [category, "Coulisses", "Témoignages", "Conseils", "Promotions"],
    bestHours: ["10:00", "19:00"],
    bestDays: ["mardi", "jeudi", "samedi"],
    audienceProfile: user.targetAudience === "b2b" ? "Audience professionnelle" : "Audience locale",
    contentTypes: ["photo"],
    language: user.contentLanguage ?? "fr",
    recommendations: `Publiez régulièrement du contenu authentique sur votre activité en ${category.toLowerCase()}. Privilégiez les photos réelles et les témoignages clients.`,
    source: "questionnaire",
    generatedAt: Date.now(),
  };
}

function inferBasicTags(caption?: string | null): string[] {
  if (!caption) return ["general"];
  const text = caption.toLowerCase();
  const tags: string[] = [];
  if (/restaurant|cuisine|plat|menu|chef|repas|nourriture/.test(text)) tags.push("nourriture");
  if (/equipe|team|staff|employe/.test(text)) tags.push("equipe");
  if (/promo|offre|reduction|solde/.test(text)) tags.push("promo");
  if (/client|avis|temoignage|merci/.test(text)) tags.push("temoignage");
  if (/evenement|event|fete|festival/.test(text)) tags.push("evenement");
  if (/chambre|hotel|sejour|hebergement/.test(text)) tags.push("chambre");
  if (/piscine|spa|detente|bien-etre/.test(text)) tags.push("detente");
  if (/vue|paysage|nature|exterieur/.test(text)) tags.push("exterieur");
  if (tags.length === 0) tags.push("general");
  return tags;
}

// ---------------------------------------------------------------------------
// Internal queries/mutations
// ---------------------------------------------------------------------------

export const getUserForAnalysis = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.userId);
  },
});

export const getChannelByExternalId = internalQuery({
  args: {
    platform: v.string(),
    externalId: v.string(),
  },
  handler: async (ctx, args) => {
    return ctx.db
      .query("channels")
      .withIndex("by_platform_external", (q) =>
        q.eq("platform", args.platform as "facebook" | "instagram" | "linkedin").eq("externalId", args.externalId),
      )
      .unique();
  },
});

export const insertPhoto = internalMutation({
  args: {
    channelId: v.id("channels"),
    userId: v.id("users"),
    storageId: v.id("_storage"),
    url: v.string(),
    filename: v.string(),
    fileSizeBytes: v.number(),
    tags: v.array(v.string()),
    sourcePostId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.sourcePostId) {
      const existing = await ctx.db
        .query("photos")
        .withIndex("by_channel", (q) => q.eq("channelId", args.channelId))
        .filter((q) => q.eq(q.field("sourcePostId"), args.sourcePostId))
        .first();
      if (existing) return existing._id;
    }
    return ctx.db.insert("photos", {
      channelId: args.channelId,
      userId: args.userId,
      storageId: args.storageId,
      url: args.url,
      filename: args.filename,
      fileSizeBytes: args.fileSizeBytes,
      tags: args.tags,
      tagsSource: "auto",
      usedCount: 0,
      sourcePostId: args.sourcePostId,
      createdAt: Date.now(),
    });
  },
});

export const saveEditorialProfile = internalMutation({
  args: {
    userId: v.id("users"),
    profile: v.any(),
  },
  handler: async (ctx, args) => {
    const profile = args.profile as EditorialProfile;
    await ctx.db.patch(args.userId, {
      businessCategory: profile.sector,
      editorialSummary: `${profile.tone} pour ${profile.sector.toLowerCase()}`,
      editorialThemes: profile.themes,
      recommendedSchedule: profile.bestDays.map(
        (day: string, i: number) => `${day} ${profile.bestHours[i % profile.bestHours.length] ?? "10:00"}`,
      ),
      samplePosts: [],
      contentLanguage: profile.language === "en" ? "en" : profile.language === "fr-en" ? "both" : "fr",
    });
  },
});
