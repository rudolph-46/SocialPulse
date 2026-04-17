/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as analyze from "../analyze.js";
import type * as app from "../app.js";
import type * as auth from "../auth.js";
import type * as calendar from "../calendar.js";
import type * as calendarManagement from "../calendarManagement.js";
import type * as credits from "../credits.js";
import type * as crons from "../crons.js";
import type * as dashboard from "../dashboard.js";
import type * as email_index from "../email/index.js";
import type * as email_templates_subscriptionEmail from "../email/templates/subscriptionEmail.js";
import type * as env from "../env.js";
import type * as http from "../http.js";
import type * as imageGeneration from "../imageGeneration.js";
import type * as init from "../init.js";
import type * as lib_uploadPost from "../lib/uploadPost.js";
import type * as otp_ResendOTP from "../otp/ResendOTP.js";
import type * as otp_VerificationCodeEmail from "../otp/VerificationCodeEmail.js";
import type * as photos from "../photos.js";
import type * as postWorkflow from "../postWorkflow.js";
import type * as stripe from "../stripe.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  analyze: typeof analyze;
  app: typeof app;
  auth: typeof auth;
  calendar: typeof calendar;
  calendarManagement: typeof calendarManagement;
  credits: typeof credits;
  crons: typeof crons;
  dashboard: typeof dashboard;
  "email/index": typeof email_index;
  "email/templates/subscriptionEmail": typeof email_templates_subscriptionEmail;
  env: typeof env;
  http: typeof http;
  imageGeneration: typeof imageGeneration;
  init: typeof init;
  "lib/uploadPost": typeof lib_uploadPost;
  "otp/ResendOTP": typeof otp_ResendOTP;
  "otp/VerificationCodeEmail": typeof otp_VerificationCodeEmail;
  photos: typeof photos;
  postWorkflow: typeof postWorkflow;
  stripe: typeof stripe;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
