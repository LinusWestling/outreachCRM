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

  const platform = valueAfter(args, "--platform");
  const handles = valuesAfter(args, "--handles");
  const ids = valuesAfter(args, "--ids");
  const excludeIds = valuesAfter(args, "--exclude-ids");
  const afterId = valueAfter(args, "--after-id");
  const readyValue = valueAfter(args, "--ready");
  const limitValue = valueAfter(args, "--limit");
  const idSet = ids.length > 0 ? new Set(ids.map(requireId)) : null;
  const handleSet = handles.length > 0 ? new Set(handles.map(normalizeHandle)) : null;
  const excludeIdSet = new Set(excludeIds.map(requireId));
  const readyFilter = readyValue == null ? null : requireBoolean(readyValue, "--ready");
  const limit = limitValue ? requirePositiveInteger(limitValue, "--limit") : null;
  const baseUrl = String(process.env.OUTREACH_API_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const [pending, activeTemplate] = await Promise.all([
    getJson(`${baseUrl}/api/creators/pending`),
    getOptionalJson(`${baseUrl}/api/templates/active?kind=Dm`),
  ]);
  const templates = args.includes("--include-templates")
    ? await getJson(`${baseUrl}/api/templates`)
    : null;

  const filtered = platform
    ? pending.filter((creator) => normalizePlatform(platformFor(creator)) === normalizePlatform(platform))
    : pending;
  const scoped = idSet
    ? filtered.filter((creator) => idSet.has(creator.id))
    : handleSet
      ? filtered.filter((creator) => handleSet.has(normalizeHandle(creator.handle)))
      : filtered;
  const readinessScoped = readyFilter == null
    ? scoped
    : scoped.filter((creator) => (creator.isReadyForAction === true) === readyFilter);
  const excluded = readinessScoped.filter((creator) => !excludeIdSet.has(creator.id));
  const afterIndex = afterId
    ? excluded.findIndex((creator) => creator.id === requireId(afterId))
    : -1;
  const afterScoped = afterId
    ? afterIndex === -1
      ? []
      : excluded.slice(afterIndex + 1)
    : excluded;
  const limited = limit ? afterScoped.slice(0, limit) : afterScoped;

  console.log(JSON.stringify({
    platform: platform ?? "all",
    count: limited.length,
    prospects: limited.map((creator) => ({
      id: creator.id,
      handle: creator.handle,
      profileUrl: creator.profileUrl,
      platform: platformFor(creator),
      displayName: creator.displayName ?? null,
      followers: creator.followers ?? null,
      email: creator.email ?? null,
      threadsUrl: creator.threadsUrl ?? null,
      code: creator.code ?? null,
      messageVersion: creator.messageVersion ?? null,
      messageTemplateId: creator.messageTemplateId ?? null,
      messageBody: creator.messageBody ?? null,
      responseStatus: creator.responseStatus ?? null,
      firstMessageDate: creator.firstMessageDate ?? null,
      lastContactDate: creator.lastContactDate ?? null,
      isReadyForAction: creator.isReadyForAction === true,
    })),
    activeTemplate: activeTemplate ? {
      id: activeTemplate.id,
      name: activeTemplate.name,
      kind: activeTemplate.kind ?? null,
      body: activeTemplate.body,
      generationRules: activeTemplate.generationRules ?? null,
      isActive: activeTemplate.isActive,
    } : null,
    templates: templates?.map((template) => ({
      id: template.id,
      name: template.name,
      kind: template.kind ?? null,
      subject: template.subject ?? null,
      body: template.body,
      generationRules: template.generationRules ?? null,
      isActive: template.isActive,
    })) ?? undefined,
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

function valuesAfter(args, name) {
  const index = args.indexOf(name);
  if (index === -1) {
    return [];
  }

  const values = [];
  for (const value of args.slice(index + 1)) {
    if (value.startsWith("-")) {
      break;
    }

    values.push(value);
  }

  if (values.length === 0) {
    throw new Error(`${name} requires at least one value.`);
  }

  return values;
}

function requireId(id) {
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error(`Invalid creator ID: ${id}`);
  }

  return id;
}

function normalizeHandle(value) {
  return String(value ?? "").trim().replace(/^@/, "").toLowerCase();
}

function requirePositiveInteger(value, name) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || String(parsed) !== String(value)) {
    throw new Error(`${name} requires a positive integer.`);
  }

  return parsed;
}

function requireBoolean(value, name) {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new Error(`${name} requires true or false.`);
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

function normalizePlatform(value) {
  return String(value ?? "").toLowerCase().replace(/\s+/g, "");
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

async function getOptionalJson(url) {
  try {
    return await getJson(url);
  } catch (error) {
    if (error instanceof Error && error.message === "Not Found") {
      return null;
    }

    throw error;
  }
}

function printUsage() {
  console.log(`Usage:
  node .codex-prospect-list.mjs [--platform TikTok|Instagram] [--ids <id...>] [--exclude-ids <id...>] [--after-id <id>] [--ready true|false] [--limit <count>] [--include-templates]

Reads queued prospects plus the active message template.
The command stays stable for Codex approval; only arguments change.`);
}
