/**
 * Crawler Sugar — server-side service layer.
 *
 * Every balance change goes through an atomic Postgres function that writes a
 * hash-chained, server-signed ledger event in the same transaction. Nothing in
 * this file mutates balances directly, so a partial write is impossible.
 */
import { roomError } from "../errors";
import type { Db } from "../store";
import {
  BURN_PERCENT,
  MAX_SUPPLY,
  NO_VALUE_NOTICE,
  RECIPIENT_PERCENT,
  TRANSFER_STEP,
  sugarConfig,
  sugarSigningKey,
} from "./config";

export interface SugarAccount {
  id: string;
  publicReference: string;
  balance: number;
  lifetimeMinted: number;
  lifetimeReceived: number;
  lifetimeSent: number;
  lifetimeBurnedFromGifts: number;
  miningStatus: string;
  leaseExpiresAt: string | null;
  progressSeconds: number;
  dailyMinted: number;
  createdAt: string;
  frozen: boolean;
}

export interface SugarGlobal {
  currentSupply: number;
  maximumSupply: number;
  lifetimeMinted: number;
  lifetimeBurned: number;
}

const n = (value: unknown): number => Number(value ?? 0);

function mapAccount(row: any): SugarAccount {
  return {
    id: row.id,
    publicReference: row.public_account_reference,
    balance: n(row.balance),
    lifetimeMinted: n(row.lifetime_minted),
    lifetimeReceived: n(row.lifetime_received),
    lifetimeSent: n(row.lifetime_sent),
    lifetimeBurnedFromGifts: n(row.lifetime_burned_from_gifts),
    miningStatus: String(row.mining_status ?? "idle"),
    leaseExpiresAt: row.current_lease_expires_at ?? null,
    progressSeconds: n(row.mining_remainder_seconds),
    dailyMinted: n(row.daily_minted_amount),
    createdAt: row.created_at,
    frozen: Boolean(row.frozen_at),
  };
}

/** Maps a database exception onto a safe, user-facing room error. */
function sugarError(error: unknown): never {
  const message = String((error as any)?.message ?? "");
  if (message.includes("SUGAR_INSUFFICIENT_BALANCE")) {
    throw roomError("INVALID_INPUT", "Dafür reicht dein Sugar-Kontostand nicht.");
  }
  if (message.includes("SUGAR_INVALID_AMOUNT")) {
    throw roomError("INVALID_INPUT", "Sugar wird in Schritten von 10 verschenkt (10, 20, 30 …).");
  }
  if (message.includes("SUGAR_SELF_TRANSFER")) {
    throw roomError("INVALID_INPUT", "Du kannst dir selbst kein Sugar schenken.");
  }
  if (message.includes("SUGAR_ACCOUNT_FROZEN")) {
    throw roomError("FORBIDDEN", "Dieses Sugar-Konto ist vorübergehend gesperrt.");
  }
  if (message.includes("SUGAR_IDENTITY_REQUIRED")) throw roomError("IDENTITY_UNAVAILABLE");
  throw roomError("INTERNAL_ERROR");
}

export async function ensureSugarAccount(db: Db, userKey: string): Promise<SugarAccount> {
  const { data, error } = await db.rpc("sugar_ensure_account", { p_user_key: userKey });
  if (error || !data) sugarError(error);
  return mapAccount(Array.isArray(data) ? data[0] : data);
}

export async function loadSugarAccount(db: Db, userKey: string): Promise<SugarAccount> {
  const { isReadOnlyCall } = await import("../call-context");
  const readOnly = isReadOnlyCall();
  if (!readOnly) await ensureSugarAccount(db, userKey);
  const { data, error } = await db.from("sugar_accounts").select("*").eq("user_id", userKey).maybeSingle();
  if (!data && readOnly) {
    // A wallet is created by an explicit write (start_sugar_mining, send_sugar),
    // never by reading the balance. Report the empty state instead.
    return mapAccount({ user_id: userKey });
  }
  if (error || !data) sugarError(error);
  return mapAccount(data);
}

export async function sugarGlobal(db: Db): Promise<SugarGlobal> {
  const { data } = await db
    .from("sugar_global_state")
    .select("current_supply, maximum_supply, lifetime_minted, lifetime_burned")
    .eq("singleton_id", 1)
    .maybeSingle();
  const row = (data ?? {}) as any;
  return {
    currentSupply: n(row.current_supply),
    maximumSupply: n(row.maximum_supply) || MAX_SUPPLY,
    lifetimeMinted: n(row.lifetime_minted),
    lifetimeBurned: n(row.lifetime_burned),
  };
}

export interface ActivityResult {
  mintedNow: number;
  miningStatus: string;
  pausedReason: string | null;
  balance: number;
  lifetimeMinted: number;
  dailyMinted: number;
  progressSeconds: number;
  leaseExpiresAt: string | null;
}

/**
 * Records qualified activity, settles any completed mining interval and keeps
 * a single 5-minute lease alive. Safe to call on every meaningful tool call.
 */
export async function recordSugarActivity(
  db: Db,
  userKey: string,
  sourceAction: string,
): Promise<ActivityResult> {
  const cfg = sugarConfig();
  const { data, error } = await db.rpc("sugar_activity", {
    p_user_key: userKey,
    p_source_action: sourceAction,
    p_lease_seconds: cfg.leaseSeconds,
    p_activity_window_seconds: cfg.activityWindowSeconds,
    p_minutes_per_unit: cfg.minutesPerUnit,
    p_daily_cap: cfg.dailyCap,
    p_min_age_hours: cfg.minimumAccountAgeHours,
    p_signing_key: sugarSigningKey(),
  });
  if (error || !data) sugarError(error);
  const row = data as any;
  return {
    mintedNow: n(row.minted_now),
    miningStatus: String(row.mining_status ?? "idle"),
    pausedReason: row.paused_reason ?? null,
    balance: n(row.balance),
    lifetimeMinted: n(row.lifetime_minted),
    dailyMinted: n(row.daily_minted),
    progressSeconds: n(row.progress_seconds),
    leaseExpiresAt: row.lease_expires_at ?? null,
  };
}

/** Best-effort activity signal: mining must never break a normal room action. */
export async function trySugarActivity(db: Db, userKey: string, sourceAction: string): Promise<void> {
  try {
    await recordSugarActivity(db, userKey, sourceAction);
  } catch {
    /* mining is a side effect, never a blocker */
  }
}

export function giftSplit(amount: number) {
  const recipient = Math.floor((amount * RECIPIENT_PERCENT) / 100);
  return { amount, recipient, burned: amount - recipient };
}

export function assertGiftAmount(raw: unknown): number {
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < TRANSFER_STEP || amount % TRANSFER_STEP !== 0) {
    throw roomError("INVALID_INPUT", "Sugar wird in Schritten von 10 verschenkt (10, 20, 30 …).");
  }
  return Math.trunc(amount);
}

export interface TransferResult {
  duplicate: boolean;
  status: string;
  senderSpends: number;
  recipientReceives: number;
  burned: number;
  balance: number;
}

export async function sendSugar(
  db: Db,
  senderKey: string,
  recipientKey: string,
  amount: number,
  idempotencyKey: string,
): Promise<TransferResult> {
  const { data, error } = await db.rpc("sugar_transfer", {
    p_sender_key: senderKey,
    p_recipient_key: recipientKey,
    p_amount: amount,
    p_idempotency_key: idempotencyKey,
    p_signing_key: sugarSigningKey(),
  });
  if (error || !data) sugarError(error);
  const row = data as any;
  return {
    duplicate: Boolean(row.duplicate),
    status: String(row.status),
    senderSpends: n(row.sender_spends),
    recipientReceives: n(row.recipient_receives),
    burned: n(row.burned),
    balance: n(row.balance),
  };
}

export async function listSugarActivity(db: Db, accountId: string, limit = 20) {
  const { data } = await db
    .from("sugar_ledger_events")
    .select("event_type, amount, created_at, metadata, transfer_group_id")
    .eq("account_id", accountId)
    .order("sequence_number", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 50));
  return ((data ?? []) as any[]).map((row) => ({
    type: row.event_type as string,
    amount: n(row.amount),
    created_at: row.created_at as string,
    source_action: (row.metadata?.source_action as string) ?? null,
  }));
}

export const SUGAR_FACTS = {
  max_supply: MAX_SUPPLY,
  transfer_step: TRANSFER_STEP,
  burn_percent: BURN_PERCENT,
  recipient_percent: RECIPIENT_PERCENT,
  monetary_value: "none",
  no_value_notice: NO_VALUE_NOTICE,
};
