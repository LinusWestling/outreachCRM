#!/usr/bin/env node

import process from "node:process";

const DEFAULT_BASE_URL = "http://127.0.0.1:5168";

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    return;
  }

  const days = Number.parseInt(valueAfter(args, "--days") ?? "7", 10);
  if (!Number.isFinite(days) || days < 0) {
    throw new Error("--days must be a non-negative integer.");
  }

  const asOf = valueAfter(args, "--as-of");
  if (asOf && !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    throw new Error("--as-of must use yyyy-MM-dd.");
  }

  const baseUrl = String(process.env.OUTREACH_API_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const params = new URLSearchParams({ daysWithoutContact: String(days) });
  if (asOf) {
    params.set("asOf", asOf);
  }

  const [candidates, activeEmailTemplate] = await Promise.all([
    getEmailFollowUpCandidates(baseUrl, days, asOf),
    getActiveEmailTemplate(baseUrl),
  ]);
  console.log(JSON.stringify({
    daysWithoutContact: days,
    asOf: asOf ?? null,
    count: candidates.length,
    activeEmailTemplate: activeEmailTemplate ? {
      id: activeEmailTemplate.id,
      name: activeEmailTemplate.name,
      subject: activeEmailTemplate.subject ?? null,
      body: activeEmailTemplate.body,
      generationRules: activeEmailTemplate.generationRules ?? null,
      isActive: activeEmailTemplate.isActive,
    } : null,
    candidates: candidates.map((creator) => ({
      id: creator.id,
      handle: creator.handle,
      profileUrl: creator.profileUrl,
      platform: platformFor(creator),
      followers: creator.followers ?? null,
      email: creator.email ?? null,
      threadsUrl: creator.threadsUrl ?? null,
      code: creator.code ?? null,
      responseStatus: creator.responseStatus ?? null,
      firstMessageDate: creator.firstMessageDate ?? null,
      lastContactDate: creator.lastContactDate ?? null,
      messageTemplateId: creator.messageTemplateId ?? null,
      messageBody: creator.messageBody ?? null,
      emailTemplateId: creator.emailTemplateId ?? null,
      emailSubject: creator.emailSubject ?? null,
      emailBody: creator.emailBody ?? null,
    })),
  }, null, 2));
}

function valueAfter(args, name) {
  const index = args.indexOf(name);
  if (index === -1) {
    return null;
  }

  const value = args[index + 1];
  if (!value || value.startsWith("-")) {
    throw new Error(`${name} requires a value.`);
  }

  return value;
}

function platformFor(creator) {
  const profileUrl = String(creator.profileUrl ?? "").toLowerCase();
  if (profileUrl.includes("tiktok.com")) {
    return "TikTok";
  }

  if (profileUrl.includes("instagram.com")) {
    return "Instagram";
  }

  if (creator.channel === 2) {
    return "TikTok";
  }

  if (creator.channel === 1) {
    return "Instagram";
  }

  return "Unknown";
}

async function getJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const body = await response.text();
  const data = body ? JSON.parse(body) : null;

  if (!response.ok) {
    const message = data?.message ?? data?.detail ?? data?.title ?? `${response.status} ${response.statusText}`.trim();
    throw new Error(message);
  }

  return data;
}

async function getActiveEmailTemplate(baseUrl) {
  try {
    return await getJson(`${baseUrl}/api/templates/active?kind=Email`);
  } catch (error) {
    const message = String(error?.message ?? "");
    if (message.includes("404")) {
      return null;
    }

    const templates = await getJson(`${baseUrl}/api/templates`);
    return templates.find((template) => template.isActive && String(template.kind ?? "").toLowerCase() === "email") ?? null;
  }
}

async function getEmailFollowUpCandidates(baseUrl, days, asOf) {
  const params = new URLSearchParams({ daysWithoutContact: String(days) });
  if (asOf) {
    params.set("asOf", asOf);
  }

  try {
    return await getJson(`${baseUrl}/api/creators/email-follow-up-candidates?${params}`);
  } catch (error) {
    const message = String(error?.message ?? "");
    if (!message.includes("405")) {
      throw error;
    }
  }

  const all = await listCreatorsFallback(baseUrl);
  const threshold = dateMinusDays(asOf ?? todayIso(), days);
  return all
    .filter((creator) => String(creator.responseStatus ?? "") === "No")
    .filter((creator) => creator.responded !== true)
    .filter((creator) => typeof creator.email === "string" && creator.email.trim())
    .filter((creator) => {
      const lastContact = creator.lastContactDate ?? creator.firstMessageDate ?? null;
      return typeof lastContact === "string" && lastContact <= threshold;
    })
    .sort((left, right) => {
      const leftDate = left.lastContactDate ?? left.firstMessageDate ?? "";
      const rightDate = right.lastContactDate ?? right.firstMessageDate ?? "";
      return leftDate.localeCompare(rightDate) || String(left.handle ?? "").localeCompare(String(right.handle ?? ""));
    });
}

async function listCreatorsFallback(baseUrl) {
  const pageSize = 200;
  const creators = [];

  for (let pageNumber = 1; pageNumber <= 20; pageNumber += 1) {
    const params = new URLSearchParams({
      HasEmail: "true",
      ResponseStatus: "No",
      PageSize: String(pageSize),
      PageNumber: String(pageNumber),
    });
    const page = await getJson(`${baseUrl}/api/creators?${params}`);
    const items = Array.isArray(page) ? page : page.items ?? [];
    creators.push(...items);

    if (Array.isArray(page) || creators.length >= (page.totalCount ?? 0) || items.length === 0) {
      break;
    }
  }

  return creators;
}

function todayIso() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
}

function dateMinusDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function printUsage() {
  console.log(`Usage:
  node .codex-email-followup-list.mjs [--days 7] [--as-of yyyy-MM-dd]

Reads reached-out email follow-up candidates from the Outreach API.
The command stays stable for Codex approval; only arguments change.`);
}
