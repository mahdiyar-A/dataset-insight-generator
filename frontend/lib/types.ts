/**
 * Shapes returned by the backend API.
 *
 * These mirror the anonymous DTOs the C# controllers serialise — chiefly
 * `AnalysisController.ToDto` and `WorkspaceController.WorkspaceToDetailDto`.
 * They are hand-maintained: nothing generates them from the C# source, so a
 * field renamed on the server will not break the build here. When you change a
 * controller DTO, change the matching interface below.
 *
 * The point of having them at all is that the alternative — `any` everywhere,
 * or `@ts-nocheck` on whole pages — meant a typo in a property name shipped
 * silently and surfaced as `undefined` in the UI.
 */

/** Lifecycle of a single analysis run. */
export type AnalysisStatus = "pending" | "processing" | "done" | "failed";

/** What the quality checker concluded about an uploaded dataset. */
export type DatasetCondition = "all_good" | "not_clean" | "low_accuracy" | "not_workable";

/** Mirrors AnalysisController.ToDto. */
export interface Analysis {
  id: string;
  fileName: string;
  reportFileName?: string | null;
  rowCount?: number | null;
  columnCount?: number | null;
  fileSizeBytes?: number | null;
  status: AnalysisStatus;
  createdAt?: string;
  completedAt?: string | null;
  hasCleanedCsv?: boolean;
  hasPdfReport?: boolean;
  hasWordReport?: boolean;
  hasPptx?: boolean;
  customization?: string | null;

  /**
   * True only for the optimistic placeholder the dashboard creates between
   * upload and the first server response. The server always sends false.
   */
  isPending?: boolean;

  /**
   * Signed URL for the first chart, used as the history tape thumbnail.
   * Signed at request time because the URLs stored with the analysis expire
   * after 24 hours. Null when the analysis produced no charts.
   */
  thumbnailUrl?: string | null;
}

/**
 * Metadata the upload endpoint returns before any analysis row exists.
 * Deliberately narrower than Analysis — there is no id yet.
 */
export interface UploadedFileMeta {
  fileName: string;
  fileSizeBytes: number;
  rowCount: number;
  columnCount: number;
  status?: string;
  uploadedAt?: string;

  /** Client-side only: set between upload and the first server response. */
  isPending?: boolean;
}

/** One chart produced by the pipeline, as stored in Analysis.chartUrls. */
export interface ChartMeta {
  type: string;
  label: string;
  desc?: string;
  color?: string;
  url: string | null;
}

/** Reply from POST /api/chat/message. */
export interface ChatReply {
  reply: string;
  condition: DatasetCondition | null;
  requiresResponse: boolean;
  done: boolean;
  failed: boolean;
  analysisId?: string | null;
}

/** Plan and quota state for the signed-in user. */
export interface UserPlan {
  plan: "free" | "pro" | "admin";
  planExpiresAt?: string | null;
  reportsUsed: number;
  reportsLimit: number;
  reportsResetAt?: string | null;
  historyLimit: number;
}

export interface AuthUser {
  id: string;
  email: string;
  userName?: string;
  plan?: string;
  isEmailVerified?: boolean;
  createdAt?: string;
  profilePictureUrl?: string | null;
  phoneNumber?: string | null;
}

// ── Teams and workspaces ─────────────────────────────────────────────────────

export type TeamRole = "owner" | "admin" | "member";

export interface Team {
  id: string;
  name: string;
  ownerId: string;
  createdAt?: string;
  memberCount?: number;
  myRole?: TeamRole;
}

export interface TeamMember {
  userId: string;
  email: string;
  userName?: string;
  role: TeamRole;
  joinedAt?: string;
}

export interface TeamInvite {
  id: string;
  email: string;
  role: TeamRole;
  createdAt?: string;
  expiresAt?: string;
}

/** Per-file access level inside a shared workspace. */
export type FilePermission = "none" | "view" | "edit";

export interface Workspace {
  id: string;
  teamId: string;
  analysisId: string;
  sharedBy: string;
  createdAt?: string;
  analysis?: WorkspaceAnalysis;
  myPermissions?: Record<string, FilePermission>;
  annotations?: Annotation[];
}

/**
 * The analysis summary embedded in a workspace. Note the flag names differ from
 * `Analysis` — `hasPdf` here versus `hasPdfReport` there — because the two DTOs
 * were written separately on the server.
 */
export interface WorkspaceAnalysis {
  id: string;
  fileName: string;
  rowCount?: number | null;
  columnCount?: number | null;
  completedAt?: string | null;
  hasPdf?: boolean;
  hasWord?: boolean;
  hasPptx?: boolean;
  hasCleanedCsv?: boolean;
  hasOriginalCsv?: boolean;
  hasCharts?: boolean;
}

export interface Annotation {
  id: string;
  userId: string;
  fileType: string;
  content: string;
  position?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
  parentId?: string | null;
  authorName?: string;
  authorEmail?: string;
  replies: Annotation[];
}

// ── Admin ────────────────────────────────────────────────────────────────────

export interface AdminStats {
  totalUsers: number;
  proUsers: number;
  totalAnalyses: number;
  analysesToday?: number;
  activeToday?: number;
}

export interface AdminUser {
  id: string;
  email: string;
  userName?: string;
  plan: string;
  planExpiresAt?: string | null;
  reportsUsed?: number;
  createdAt?: string;
  lastActiveAt?: string | null;
}

/** A signed, time-limited URL for downloading a generated file. */
export interface DownloadLink {
  url: string;
  fileName: string;
}

// ── Error handling ───────────────────────────────────────────────────────────

/**
 * Extract a displayable message from a caught value.
 *
 * TypeScript types `catch` bindings as `unknown`, which is correct — anything
 * can be thrown. The previous workaround was `catch (e: any)` in 22 places,
 * which silently permitted `e.mesage` and similar typos to reach production as
 * "undefined" in the UI.
 */
export function errorMessage(e: unknown, fallback = "Something went wrong."): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "string" && e) return e;
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string" && m) return m;
  }
  return fallback;
}
