/**
 * MCP handlers for Crawler Sugar.
 *
 * Sugar is free for every plan, has no monetary value and never leaves
 * Crawler. Ownership is always the pseudonymous subject from `_meta` — never
 * an input, and the ChatGPT session id is never stored or derived from.
 */
import { roomError } from "./errors";
import { resolveIdentity, type McpMeta } from "./identity";
import { findProfileByHandle } from "./profile";
import { enforceRateLimit, WINDOWS } from "./ratelimit";
import { getDb, touchPresence, type Db } from "./store";
import { sugarConfig, NO_VALUE_NOTICE, TRANSFER_STEP } from "./sugar/config";
import { hmacSha256Hex } from "./crypto";
import { roomSubjectSecret } from "./config";
import {
  assertGiftAmount,
  giftSplit,
  listSugarActivity,
  loadSugarAccount,
  recordSugarActivity,
  sendSugar,
  sugarGlobal,
  SUGAR_FACTS,
  type SugarAccount,
} from "./sugar/service";

const PAUSE_REASONS: Record<string, string> = {
  trust_period: "Neue Kennungen können erst nach 24 Stunden aktiver Nutzung Sugar erzeugen.",
  daily_cap: "Das Tageslimit für heute ist erreicht. Morgen geht es weiter.",
  max_supply: "Die weltweite Sugar-Höchstmenge ist erreicht. Erst nach Burns entsteht neues Sugar.",
  frozen: "Dieses Sugar-Konto ist vorübergehend gesperrt.",
};

function miningView(account: SugarAccount, reason?: string | null) {
  const cfg = sugarConfig();
  const perUnit = cfg.minutesPerUnit * 60;
  return {
    mining_status: account.miningStatus,
    lease_expires_at: account.leaseExpiresAt,
    progress_percent: Math.min(100, Math.round((account.progressSeconds / perUnit) * 100)),
    minutes_per_sugar: cfg.minutesPerUnit,
    daily_minted: account.dailyMinted,
    daily_cap: cfg.dailyCap,
    paused_reason: reason ?? null,
    paused_explanation: reason ? (PAUSE_REASONS[reason] ?? null) : null,
  };
}

async function resolveRecipient(db: Db, username: unknown) {
  const found = await findProfileByHandle(db, String(username ?? ""));
  if (!found) throw roomError("NOT_FOUND", "Dieses Profil gibt es nicht.");
  return found.profile;
}

/* ------------------------------- my balance ------------------------------- */

export async function handleGetMySugar(_input: unknown, meta: McpMeta) {
  const identity = await resolveIdentity(meta);
  const db = await getDb();
  await touchPresence(db, identity.subjectHash);

  const activity = await recordSugarActivity(db, identity.subjectHash, "get_my_sugar");
  const account = await loadSugarAccount(db, identity.subjectHash);
  const global = await sugarGlobal(db);

  return {
    balance: account.balance,
    minted_all_time: account.lifetimeMinted,
    received_all_time: account.lifetimeReceived,
    sent_all_time: account.lifetimeSent,
    burned_from_my_gifts: account.lifetimeBurnedFromGifts,
    minted_just_now: activity.mintedNow,
    ...miningView(account, activity.pausedReason),
    global_supply: global.currentSupply,
    global_maximum_supply: global.maximumSupply,
    global_burned_all_time: global.lifetimeBurned,
    ...SUGAR_FACTS,
    display_instruction:
      "Nenne Kontostand und 'Minted all time'. Weise immer darauf hin, dass Sugar keinen Geldwert hat und nur in Crawler funktioniert. Keine Kurse, keine Umrechnung in Geld, keine Handelsempfehlungen.",
  };
}

/* --------------------------------- mining --------------------------------- */

export async function handleStartSugarMining(_input: unknown, meta: McpMeta) {
  const identity = await resolveIdentity(meta);
  const db = await getDb();
  await touchPresence(db, identity.subjectHash);

  const activity = await recordSugarActivity(db, identity.subjectHash, "start_sugar_mining");
  const account = await loadSugarAccount(db, identity.subjectHash);
  const view = miningView(account, activity.pausedReason);

  return {
    ...view,
    balance: account.balance,
    minted_all_time: account.lifetimeMinted,
    minted_just_now: activity.mintedNow,
    message: activity.pausedReason
      ? (PAUSE_REASONS[activity.pausedReason] ?? "Mining ist gerade pausiert.")
      : `Mining läuft für ${sugarConfig().leaseSeconds / 60} Minuten. Bleib aktiv — pro ${
          sugarConfig().minutesPerUnit
        } Minuten echter Nutzung entsteht 1 Sugar.`,
    ...SUGAR_FACTS,
  };
}

/* -------------------------------- gifting --------------------------------- */

export async function handlePreviewSugarGift(input: unknown, meta: McpMeta) {
  const identity = await resolveIdentity(meta);
  const db = await getDb();
  const payload = (input ?? {}) as any;

  const amount = assertGiftAmount(payload.amount);
  const recipient = await resolveRecipient(db, payload.username);
  if (recipient.ownerSubjectHash === identity.subjectHash) {
    throw roomError("INVALID_INPUT", "Du kannst dir selbst kein Sugar schenken.");
  }

  const account = await loadSugarAccount(db, identity.subjectHash);
  const split = giftSplit(amount);
  const bucket = Math.floor(Date.now() / 300_000);
  const token = await hmacSha256Hex(
    roomSubjectSecret(),
    `sugar-gift|${identity.subjectHash}|${recipient.handle}|${amount}|${bucket}`,
  );

  return {
    recipient_handle: recipient.handle,
    recipient_display_name: recipient.roomName,
    you_spend: split.amount,
    recipient_receives: split.recipient,
    burned: split.burned,
    your_balance: account.balance,
    balance_after: account.balance - split.amount,
    sufficient: account.balance >= split.amount,
    confirmation_required: true,
    confirmation_token: token.slice(0, 32),
    ...SUGAR_FACTS,
    display_instruction:
      "Zeige klar: Betrag, was @handle erhält (30 %), was verbrannt wird (70 %) und den Hinweis, dass Sugar keinen Geldwert hat. Frage danach ausdrücklich nach einer Bestätigung, bevor send_sugar aufgerufen wird.",
  };
}

export async function handleSendSugar(input: unknown, meta: McpMeta) {
  const identity = await resolveIdentity(meta);
  const db = await getDb();
  await touchPresence(db, identity.subjectHash);

  const payload = (input ?? {}) as any;
  const amount = assertGiftAmount(payload.amount);
  const recipient = await resolveRecipient(db, payload.username);
  const split = giftSplit(amount);

  if (payload.confirm !== true) {
    return {
      confirmation_required: true,
      recipient_handle: recipient.handle,
      you_spend: split.amount,
      recipient_receives: split.recipient,
      burned: split.burned,
      message: `Bestätigung nötig: ${split.amount} Sugar senden — @${recipient.handle} erhält ${split.recipient}, ${split.burned} werden verbrannt. Sugar hat keinen Geldwert.`,
      ...SUGAR_FACTS,
    };
  }

  await enforceRateLimit(db, identity.subjectHash, "sugar_gift", WINDOWS.join(20));

  const bucket = Math.floor(Date.now() / 300_000);
  const idempotencyKey =
    typeof payload.confirmation_token === "string" && payload.confirmation_token.trim()
      ? payload.confirmation_token.trim().slice(0, 64)
      : (
          await hmacSha256Hex(
            roomSubjectSecret(),
            `sugar-gift|${identity.subjectHash}|${recipient.handle}|${amount}|${bucket}`,
          )
        ).slice(0, 32);

  const result = await sendSugar(
    db,
    identity.subjectHash,
    recipient.ownerSubjectHash,
    amount,
    idempotencyKey,
  );

  return {
    status: result.status,
    duplicate: result.duplicate,
    recipient_handle: recipient.handle,
    you_spent: result.senderSpends,
    recipient_received: result.recipientReceives,
    burned: result.burned,
    balance: result.balance,
    message: result.duplicate
      ? "Dieses Geschenk wurde bereits gesendet."
      : `${result.senderSpends} Sugar gesendet: @${recipient.handle} erhält ${result.recipientReceives}, ${result.burned} sind verbrannt.`,
    ...SUGAR_FACTS,
  };
}

/* ------------------------------ public + log ------------------------------ */

export async function handleGetPublicSugar(input: unknown, meta: McpMeta) {
  await resolveIdentity(meta);
  const db = await getDb();
  const profile = await resolveRecipient(db, (input as any)?.username);
  const account = await loadSugarAccount(db, profile.ownerSubjectHash);

  return {
    handle: profile.handle,
    display_name: profile.roomName,
    balance: account.balance,
    minted_all_time: account.lifetimeMinted,
    ...SUGAR_FACTS,
    display_instruction:
      "Nenne Kontostand und 'Minted all time' von @handle und den Hinweis 'no monetary value'. Keine anderen Kontodaten sind öffentlich.",
  };
}

export async function handleListMySugarActivity(input: unknown, meta: McpMeta) {
  const identity = await resolveIdentity(meta);
  const db = await getDb();
  const account = await loadSugarAccount(db, identity.subjectHash);
  const limit = Number((input as any)?.limit ?? 20);
  const events = await listSugarActivity(db, account.id, Number.isFinite(limit) ? limit : 20);

  return {
    balance: account.balance,
    minted_all_time: account.lifetimeMinted,
    events,
    transfer_step: TRANSFER_STEP,
    no_value_notice: NO_VALUE_NOTICE,
  };
}
