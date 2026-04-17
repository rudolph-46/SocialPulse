import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Auto-approve drafts every hour (pilote automatique)
crons.interval(
  "auto-approve drafts",
  { hours: 1 },
  internal.postWorkflow.autoApproveDrafts,
);

// Auto-archive expired calendars daily at 2am
crons.interval(
  "auto-archive expired calendars",
  { hours: 24 },
  internal.postWorkflow.autoArchiveExpiredCalendars,
);

export default crons;
