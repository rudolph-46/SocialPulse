const BASE_URL = "https://api.upload-post.com";

function getApiKey(): string {
  const key = process.env.UPLOAD_POST_API_KEY;
  if (!key) throw new Error("UPLOAD_POST_API_KEY is not configured");
  return key;
}

function headers(extra?: Record<string, string>): Record<string, string> {
  return {
    Authorization: `Apikey ${getApiKey()}`,
    ...extra,
  };
}

async function request<T = unknown>(
  method: string,
  path: string,
  opts?: { body?: FormData | Record<string, unknown>; params?: Record<string, string> },
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  if (opts?.params) {
    for (const [k, v] of Object.entries(opts.params)) {
      if (v !== undefined) url.searchParams.set(k, v);
    }
  }

  const isFormData = opts?.body instanceof FormData;
  const fetchOpts: RequestInit = {
    method,
    headers: headers(
      !isFormData && opts?.body ? { "Content-Type": "application/json" } : undefined,
    ),
  };

  if (opts?.body) {
    fetchOpts.body = isFormData
      ? (opts.body as FormData)
      : JSON.stringify(opts.body);
  }

  const res = await fetch(url.toString(), fetchOpts);
  const data = await res.json();

  if (!res.ok) {
    throw new UploadPostError(
      data.error || data.message || `HTTP ${res.status}`,
      res.status,
      data,
    );
  }
  return data as T;
}

export class UploadPostError extends Error {
  constructor(
    message: string,
    public status: number,
    public data: unknown,
  ) {
    super(`UploadPost API error (${status}): ${message}`);
    this.name = "UploadPostError";
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Platform =
  | "facebook"
  | "instagram"
  | "linkedin"
  | "x"
  | "tiktok"
  | "youtube"
  | "threads"
  | "pinterest"
  | "bluesky"
  | "reddit";

export type UploadStatus = "PENDING" | "PROCESSING" | "FINISHED" | "ERROR";

export interface StatusResponse {
  status: UploadStatus;
  platforms?: Record<
    string,
    { post_id?: string; post_url?: string; error_message?: string }
  >;
  request_id?: string;
}

export interface ScheduledPost {
  job_id: string;
  scheduled_date: string;
  post_type: string;
  profile_username: string;
  title?: string;
  preview_url?: string;
}

export interface AnalyticsData {
  followers?: number;
  reach?: number;
  views?: number;
  impressions?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  reach_timeseries?: number[];
  [key: string]: unknown;
}

export interface PostAnalytics {
  success: boolean;
  platform_post_id?: string;
  post_url?: string;
  post_metrics?: Record<string, unknown>;
  profile_snapshot_at_post_date?: Record<string, unknown>;
  profile_snapshot_latest?: Record<string, unknown>;
}

export interface Comment {
  id: string;
  text: string;
  username?: string;
  timestamp?: string;
  [key: string]: unknown;
}

export interface MediaItem {
  id: string;
  caption?: string;
  media_type?: string;
  media_url?: string;
  permalink?: string;
  timestamp?: string;
  thumbnail_url?: string;
}

export interface FacebookPage {
  id: string;
  name: string;
  picture?: string;
  account_id?: string;
}

export interface LinkedInPage {
  id: string;
  name: string;
  picture?: string;
  vanityName?: string;
  account_id?: string;
}

export interface QueueSettings {
  timezone: string;
  slots: { hour: number; minute: number }[];
  days_of_week: number[];
  max_posts_per_slot: number;
  full_slots?: string[];
}

export interface QueueSlotPreview {
  datetime: string;
  post_count: number;
  max_posts_per_slot: number;
  is_full: boolean;
  scheduled_posts?: unknown[];
}

export interface AutoDMMonitor {
  monitor_id: string;
  status: "running" | "paused" | "stopped";
  post_url: string;
  reply_message: string;
  [key: string]: unknown;
}

export interface HistoryRecord {
  request_id: string;
  post_type?: string;
  platforms?: string[];
  title?: string;
  created_at?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// User Profiles — create/list/get/delete profiles on Upload-Post
// Each SocialPulse user gets their own Upload-Post profile (username).
// The profile is the identity used for all API calls (user param).
// ---------------------------------------------------------------------------

export interface UserProfile {
  username: string;
  connected_platforms?: string[];
  [key: string]: unknown;
}

export async function createProfile(username: string) {
  return request<{ success: boolean; profile: UserProfile }>(
    "POST",
    "/api/uploadposts/users",
    { body: { username } },
  );
}

export async function listProfiles() {
  return request<{
    success: boolean;
    limit: number;
    plan: string;
    profiles: UserProfile[];
  }>("GET", "/api/uploadposts/users");
}

export async function getProfile(username: string) {
  return request<{ success: boolean; profile: UserProfile }>(
    "GET",
    `/api/uploadposts/users/${encodeURIComponent(username)}`,
  );
}

export async function deleteProfile(username: string) {
  return request<{ success: boolean; message: string }>(
    "DELETE",
    "/api/uploadposts/users",
    { body: { username } },
  );
}

// ---------------------------------------------------------------------------
// JWT — generate OAuth widget URL for connecting social accounts
// The user opens the returned access_url in a popup/redirect.
// After connecting, Upload-Post stores the tokens on their side.
// ---------------------------------------------------------------------------

export interface GenerateJwtOptions {
  username: string;
  redirectUrl?: string;
  logoImage?: string;
  redirectButtonText?: string;
  connectTitle?: string;
  connectDescription?: string;
  platforms?: Platform[];
  showCalendar?: boolean;
}

export async function generateJwt(opts: GenerateJwtOptions) {
  const body: Record<string, unknown> = { username: opts.username };
  if (opts.redirectUrl) body.redirect_url = opts.redirectUrl;
  if (opts.logoImage) body.logo_image = opts.logoImage;
  if (opts.redirectButtonText) body.redirect_button_text = opts.redirectButtonText;
  if (opts.connectTitle) body.connect_title = opts.connectTitle;
  if (opts.connectDescription) body.connect_description = opts.connectDescription;
  if (opts.platforms) body.platforms = opts.platforms;
  if (opts.showCalendar !== undefined) body.show_calendar = opts.showCalendar;
  return request<{ success: boolean; access_url: string; duration: string }>(
    "POST",
    "/api/uploadposts/users/generate-jwt",
    { body },
  );
}

export async function validateJwt(_bearerToken: string) {
  return request<{
    success?: boolean;
    isValid?: boolean;
    profile?: UserProfile;
    reason?: string;
  }>("POST", "/api/uploadposts/users/validate-jwt", {
    body: {},
  });
}

// ---------------------------------------------------------------------------
// Upload (Publish)
// ---------------------------------------------------------------------------

export interface PhotoUploadOptions {
  user: string;
  platforms: Platform[];
  photoUrls: string[];
  title?: string;
  description?: string;
  scheduledDate?: string;
  timezone?: string;
  async?: boolean;
  addToQueue?: boolean;
  firstComment?: string;
  facebookPageId?: string;
  linkedinPageUrn?: string;
  idempotencyKey?: string;
}

export async function uploadPhotos(opts: PhotoUploadOptions) {
  const body: Record<string, unknown> = {
    user: opts.user,
    "platform[]": opts.platforms,
    "photos[]": opts.photoUrls,
  };
  if (opts.title) body.title = opts.title;
  if (opts.description) body.description = opts.description;
  if (opts.scheduledDate) body.scheduled_date = opts.scheduledDate;
  if (opts.timezone) body.timezone = opts.timezone;
  if (opts.async) body.async_upload = true;
  if (opts.addToQueue) body.add_to_queue = true;
  if (opts.firstComment) body.first_comment = opts.firstComment;
  if (opts.facebookPageId) body.facebook_page_id = opts.facebookPageId;
  if (opts.linkedinPageUrn) body.target_linkedin_page_urn = opts.linkedinPageUrn;

  const h: Record<string, string> = {};
  if (opts.idempotencyKey) h["Idempotency-Key"] = opts.idempotencyKey;

  return request<StatusResponse>("POST", "/api/upload_photos", { body });
}

export interface VideoUploadOptions {
  user: string;
  platforms: Platform[];
  fileUrl: string;
  title?: string;
  description?: string;
  scheduledDate?: string;
  timezone?: string;
  async?: boolean;
  addToQueue?: boolean;
  firstComment?: string;
  facebookPageId?: string;
  linkedinPageUrn?: string;
  idempotencyKey?: string;
}

export async function uploadVideo(opts: VideoUploadOptions) {
  const body: Record<string, unknown> = {
    user: opts.user,
    "platform[]": opts.platforms,
    file: opts.fileUrl,
  };
  if (opts.title) body.title = opts.title;
  if (opts.description) body.description = opts.description;
  if (opts.scheduledDate) body.scheduled_date = opts.scheduledDate;
  if (opts.timezone) body.timezone = opts.timezone;
  if (opts.async !== undefined) body.async_upload = opts.async;
  if (opts.addToQueue) body.add_to_queue = true;
  if (opts.firstComment) body.first_comment = opts.firstComment;
  if (opts.facebookPageId) body.facebook_page_id = opts.facebookPageId;
  if (opts.linkedinPageUrn) body.target_linkedin_page_urn = opts.linkedinPageUrn;

  return request<StatusResponse>("POST", "/api/upload", { body });
}

export interface TextUploadOptions {
  user: string;
  platforms: Platform[];
  title: string;
  scheduledDate?: string;
  timezone?: string;
  addToQueue?: boolean;
  facebookPageId?: string;
  linkedinPageUrn?: string;
  idempotencyKey?: string;
}

export async function uploadText(opts: TextUploadOptions) {
  const body: Record<string, unknown> = {
    user: opts.user,
    "platform[]": opts.platforms,
    title: opts.title,
  };
  if (opts.scheduledDate) body.scheduled_date = opts.scheduledDate;
  if (opts.timezone) body.timezone = opts.timezone;
  if (opts.addToQueue) body.add_to_queue = true;
  if (opts.facebookPageId) body.facebook_page_id = opts.facebookPageId;
  if (opts.linkedinPageUrn) body.target_linkedin_page_urn = opts.linkedinPageUrn;

  return request<StatusResponse>("POST", "/api/upload_text", { body });
}

// ---------------------------------------------------------------------------
// Upload Status & History
// ---------------------------------------------------------------------------

export async function getUploadStatus(opts: {
  requestId?: string;
  jobId?: string;
}) {
  const params: Record<string, string> = {};
  if (opts.requestId) params.request_id = opts.requestId;
  if (opts.jobId) params.job_id = opts.jobId;
  return request<StatusResponse>("GET", "/api/uploadposts/status", { params });
}

export async function getUploadHistory(opts?: {
  page?: number;
  limit?: number;
}) {
  const params: Record<string, string> = {};
  if (opts?.page) params.page = String(opts.page);
  if (opts?.limit) params.limit = String(opts.limit);
  return request<{
    history: HistoryRecord[];
    total: number;
    page: number;
    limit: number;
  }>("GET", "/api/uploadposts/history", { params });
}

// ---------------------------------------------------------------------------
// Schedule Management
// ---------------------------------------------------------------------------

export async function listScheduledPosts() {
  return request<ScheduledPost[]>("GET", "/api/uploadposts/schedule");
}

export async function cancelScheduledPost(jobId: string) {
  return request("DELETE", `/api/uploadposts/schedule/${jobId}`);
}

export async function editScheduledPost(
  jobId: string,
  updates: {
    scheduledDate?: string;
    timezone?: string;
    title?: string;
    caption?: string;
  },
) {
  const body: Record<string, unknown> = {};
  if (updates.scheduledDate) body.scheduled_date = updates.scheduledDate;
  if (updates.timezone) body.timezone = updates.timezone;
  if (updates.title) body.title = updates.title;
  if (updates.caption) body.caption = updates.caption;
  return request("PATCH", `/api/uploadposts/schedule/${jobId}`, { body });
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export async function getProfileAnalytics(
  profileUsername: string,
  platforms: Platform[],
  opts?: { pageId?: string; pageUrn?: string },
) {
  const params: Record<string, string> = {
    platforms: platforms.join(","),
  };
  if (opts?.pageId) params.page_id = opts.pageId;
  if (opts?.pageUrn) params.page_urn = opts.pageUrn;
  return request<Record<string, AnalyticsData>>(
    "GET",
    `/api/analytics/${profileUsername}`,
    { params },
  );
}

export async function getTotalImpressions(
  profileUsername: string,
  opts?: {
    date?: string;
    startDate?: string;
    endDate?: string;
    period?: string;
    platform?: string;
    breakdown?: boolean;
    metrics?: string;
  },
) {
  const params: Record<string, string> = {};
  if (opts?.date) params.date = opts.date;
  if (opts?.startDate) params.start_date = opts.startDate;
  if (opts?.endDate) params.end_date = opts.endDate;
  if (opts?.period) params.period = opts.period;
  if (opts?.platform) params.platform = opts.platform;
  if (opts?.breakdown) params.breakdown = "true";
  if (opts?.metrics) params.metrics = opts.metrics;
  return request<{ total_impressions?: number; [key: string]: unknown }>(
    "GET",
    `/api/uploadposts/total-impressions/${profileUsername}`,
    { params },
  );
}

export async function getPostAnalyticsByRequestId(
  requestId: string,
  platform?: string,
) {
  const params: Record<string, string> = {};
  if (platform) params.platform = platform;
  return request<PostAnalytics>(
    "GET",
    `/api/uploadposts/post-analytics/${requestId}`,
    { params },
  );
}

export async function getPostAnalyticsByPlatformId(opts: {
  platformPostId: string;
  platform: string;
  user: string;
}) {
  return request<PostAnalytics>("GET", "/api/uploadposts/post-analytics", {
    params: {
      platform_post_id: opts.platformPostId,
      platform: opts.platform,
      user: opts.user,
    },
  });
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export async function getComments(opts: {
  platform: string;
  user: string;
  postId?: string;
  postUrl?: string;
}) {
  const params: Record<string, string> = {
    platform: opts.platform,
    user: opts.user,
  };
  if (opts.postId) params.post_id = opts.postId;
  if (opts.postUrl) params.post_url = opts.postUrl;
  return request<{ comments: Comment[] }>("GET", "/api/uploadposts/comments", {
    params,
  });
}

export async function replyToCommentPrivate(opts: {
  platform: string;
  user: string;
  commentId: string;
  message: string;
}) {
  return request("POST", "/api/uploadposts/comments/reply", {
    body: {
      platform: opts.platform,
      user: opts.user,
      comment_id: opts.commentId,
      message: opts.message,
    },
  });
}

export async function replyToCommentPublic(opts: {
  platform: string;
  user: string;
  commentId: string;
  message: string;
}) {
  return request("POST", "/api/uploadposts/comments/public-reply", {
    body: {
      platform: opts.platform,
      user: opts.user,
      comment_id: opts.commentId,
      message: opts.message,
    },
  });
}

// ---------------------------------------------------------------------------
// Direct Messages
// ---------------------------------------------------------------------------

export async function sendDM(opts: {
  platform: string;
  user: string;
  recipientId: string;
  message: string;
}) {
  return request("POST", "/api/uploadposts/dms/send", {
    body: {
      platform: opts.platform,
      user: opts.user,
      recipient_id: opts.recipientId,
      message: opts.message,
    },
  });
}

export async function getConversations(opts: {
  platform: string;
  user: string;
}) {
  return request("GET", "/api/uploadposts/dms/conversations", {
    params: { platform: opts.platform, user: opts.user },
  });
}

// ---------------------------------------------------------------------------
// AutoDM Monitors
// ---------------------------------------------------------------------------

export async function startAutoDM(opts: {
  postUrl: string;
  replyMessage: string;
  profileUsername: string;
  monitoringInterval?: number;
  triggerKeywords?: string[];
}) {
  const body: Record<string, unknown> = {
    post_url: opts.postUrl,
    reply_message: opts.replyMessage,
    profile_username: opts.profileUsername,
  };
  if (opts.monitoringInterval) body.monitoring_interval = opts.monitoringInterval;
  if (opts.triggerKeywords) body.trigger_keywords = opts.triggerKeywords;
  return request<AutoDMMonitor>("POST", "/api/uploadposts/autodms/start", { body });
}

export async function getAutoDMStatuses() {
  return request<AutoDMMonitor[]>("GET", "/api/uploadposts/autodms/status");
}

export async function getAutoDMLogs(monitorId: string) {
  return request("GET", "/api/uploadposts/autodms/logs", {
    params: { monitor_id: monitorId },
  });
}

export async function pauseAutoDM(monitorId: string) {
  return request("POST", "/api/uploadposts/autodms/pause", {
    body: { monitor_id: monitorId },
  });
}

export async function resumeAutoDM(monitorId: string) {
  return request("POST", "/api/uploadposts/autodms/resume", {
    body: { monitor_id: monitorId },
  });
}

export async function stopAutoDM(monitorId: string) {
  return request("POST", "/api/uploadposts/autodms/stop", {
    body: { monitor_id: monitorId },
  });
}

export async function deleteAutoDM(monitorId: string) {
  return request("POST", "/api/uploadposts/autodms/delete", {
    body: { monitor_id: monitorId },
  });
}

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

export async function listMedia(opts: {
  platform: Platform;
  user: string;
  pageUrn?: string;
}) {
  const params: Record<string, string> = {
    platform: opts.platform,
    user: opts.user,
  };
  if (opts.pageUrn) params.page_urn = opts.pageUrn;
  return request<{ media: MediaItem[] }>("GET", "/api/uploadposts/media", {
    params,
  });
}

// ---------------------------------------------------------------------------
// Platform Pages (Facebook, LinkedIn, Pinterest, Google Business)
// ---------------------------------------------------------------------------

export async function getFacebookPages(profile?: string) {
  const params: Record<string, string> = {};
  if (profile) params.profile = profile;
  const res = await request<{ success: boolean; pages: FacebookPage[] }>(
    "GET",
    "/api/uploadposts/facebook/pages",
    { params },
  );
  return res.pages ?? [];
}

export async function getLinkedInPages(profile?: string) {
  const params: Record<string, string> = {};
  if (profile) params.profile = profile;
  return request<LinkedInPage[]>("GET", "/api/uploadposts/linkedin/pages", {
    params,
  });
}

export async function getPinterestBoards(profile?: string) {
  const params: Record<string, string> = {};
  if (profile) params.profile = profile;
  return request("GET", "/api/uploadposts/pinterest/boards", { params });
}

export async function getGoogleBusinessLocations(profile?: string) {
  const params: Record<string, string> = {};
  if (profile) params.profile = profile;
  return request("GET", "/api/uploadposts/google-business/locations", { params });
}

// ---------------------------------------------------------------------------
// Queue System
// ---------------------------------------------------------------------------

export async function getQueueSettings(profileUsername: string) {
  return request<QueueSettings>("GET", "/api/uploadposts/queue/settings", {
    params: { profile_username: profileUsername },
  });
}

export async function updateQueueSettings(opts: {
  profileUsername: string;
  timezone?: string;
  slots?: { hour: number; minute: number }[];
  daysOfWeek?: number[];
  maxPostsPerSlot?: number;
}) {
  const body: Record<string, unknown> = {
    profile_username: opts.profileUsername,
  };
  if (opts.timezone) body.timezone = opts.timezone;
  if (opts.slots) body.slots = opts.slots;
  if (opts.daysOfWeek) body.days_of_week = opts.daysOfWeek;
  if (opts.maxPostsPerSlot) body.max_posts_per_slot = opts.maxPostsPerSlot;
  return request("POST", "/api/uploadposts/queue/settings", { body });
}

export async function previewQueueSlots(
  profileUsername: string,
  count?: number,
) {
  const params: Record<string, string> = {
    profile_username: profileUsername,
  };
  if (count) params.count = String(count);
  return request<QueueSlotPreview[]>("GET", "/api/uploadposts/queue/preview", {
    params,
  });
}

export async function getNextQueueSlot(profileUsername: string) {
  return request("GET", "/api/uploadposts/queue/next-slot", {
    params: { profile_username: profileUsername },
  });
}

export async function markSlotFull(profileUsername: string, slotDatetime: string) {
  return request("POST", "/api/uploadposts/queue/slot-full", {
    body: { profile_username: profileUsername, slot_datetime: slotDatetime },
  });
}

export async function unmarkSlotFull(profileUsername: string, slotDatetime: string) {
  return request("DELETE", "/api/uploadposts/queue/slot-full", {
    body: { profile_username: profileUsername, slot_datetime: slotDatetime },
  });
}

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

export async function getMe() {
  return request<{
    success: boolean;
    email: string;
    plan: string;
    preferences?: { weekStartDay?: number };
  }>("GET", "/api/uploadposts/me");
}
