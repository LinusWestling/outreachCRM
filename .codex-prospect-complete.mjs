#!/usr/bin/env node

import process from "node:process";

const DEFAULT_BASE_URL = "http://127.0.0.1:5168";

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

async function main() {
  const id = requireId(valueAfter(process.argv.slice(2), "--id"));
  const baseUrl = String(process.env.OUTREACH_API_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const pending = await getJson(`${baseUrl}/api/creators/pending`);
  const creator = pending.find((item) => item.id === id);

  if (!creator) {
    throw new Error(`Queued prospect ${id} was not found.`);
  }

  const profileUrl = String(creator.profileUrl ?? "").toLowerCase();
  if (!profileUrl.includes("tiktok.com") && !profileUrl.includes("instagram.com")) {
    throw new Error(`Prospect @${creator.handle ?? id} is not an Instagram or TikTok prospect.`);
  }

  if (creator.isReadyForAction !== true || !creator.followers || !creator.messageBody?.trim()) {
    throw new Error(`Prospect @${creator.handle ?? id} is no longer ready with a follower count and saved DM.`);
  }

  const completed = await postJson(`${baseUrl}/api/creators/pending/${id}/complete`, {
    email: creator.email ?? null,
    threadsUrl: creator.threadsUrl ?? null,
    followers: creator.followers,
    code: creator.code ?? null,
    messageTemplateId: creator.messageTemplateId ?? null,
    messageVersion: creator.messageVersion ?? null,
    messageBody: creator.messageBody,
    firstMessageDate: creator.firstMessageDate ?? null,
    lastContactDate: new Date().toISOString().slice(0, 10),
  });

  console.log(JSON.stringify({
    id: completed.id,
    handle: completed.handle ?? creator.handle ?? null,
    status: completed.status ?? null,
    lastContactDate: completed.lastContactDate ?? null,
  }, null, 2));
}

function valueAfter(args, name) {
  const index = args.indexOf(name);
  const value = index === -1 ? null : args[index + 1];
  if (!value || value.startsWith("-")) throw new Error(`${name} requires a value.`);
  return value;
}

function requireId(value) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`Invalid creator ID: ${value}`);
  }
  return value;
}

async function getJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  return parseResponse(response);
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  return parseResponse(response);
}

async function parseResponse(response) {
  const body = await response.text();
  const data = body ? JSON.parse(body) : null;
  if (!response.ok) throw new Error(data?.message ?? `${response.status} ${response.statusText}`);
  return data;
}
