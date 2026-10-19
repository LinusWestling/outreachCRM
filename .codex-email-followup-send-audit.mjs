#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import process from "node:process";

const DEFAULT_BASE_URL = "http://127.0.0.1:5168";
// Signature links expected in every sent follow-up. Kept out of the repo in
// .codex-email-signature.json as { "urls": ["https://..."] }; OUTREACH_SIGNATURE_URLS
// (comma-separated) overrides it.
const SIGNATURE_URLS = await readSignatureUrls();

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log("Usage: node .codex-email-followup-send-audit.mjs [--date yyyy-MM-dd]");
    return;
  }

  const date = valueAfter(args, "--date") ?? todayIso();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("--date must use yyyy-MM-dd.");
  }

  const baseUrl = String(process.env.OUTREACH_API_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const params = new URLSearchParams({
    HasEmail: "true",
    LastContactFrom: date,
    LastContactTo: date,
    SortBy: "LastContactDate",
    SortDescending: "true",
    PageNumber: "1",
    PageSize: "200",
  });
  const page = await getJson(`${baseUrl}/api/creators?${params}`);
  const items = Array.isArray(page) ? page : page.items ?? [];
  const sent = items
    .filter((creator) => typeof creator.emailSubject === "string" && creator.emailSubject.trim())
    .filter((creator) => typeof creator.emailBody === "string" && creator.emailBody.trim())
    .map((creator) => ({
      id: creator.id,
      handle: creator.handle ?? creator.profileUrl,
      email: creator.email ?? null,
      emailSubject: creator.emailSubject,
      lastContactDate: creator.lastContactDate ?? null,
      signatureUrlsPresent: SIGNATURE_URLS.filter((url) => creator.emailBody.includes(url)),
      signatureComplete: SIGNATURE_URLS.every((url) => creator.emailBody.includes(url)),
    }));

  console.log(JSON.stringify({
    date,
    sentCount: sent.length,
    allSignatureLinksPresent: sent.length > 0 && sent.every((item) => item.signatureComplete),
    sent,
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

async function getJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const body = await response.text();
  const data = body ? JSON.parse(body) : null;
  if (!response.ok) {
    throw new Error(data?.message ?? data?.detail ?? data?.title ?? `${response.status} ${response.statusText}`.trim());
  }

  return data;
}

function todayIso() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
}

async function readSignatureUrls() {
  if (process.env.OUTREACH_SIGNATURE_URLS) {
    return process.env.OUTREACH_SIGNATURE_URLS.split(",").map((url) => url.trim()).filter(Boolean);
  }

  try {
    const config = JSON.parse(await readFile(new URL("./.codex-email-signature.json", import.meta.url), "utf8"));
    return Array.isArray(config.urls) ? config.urls : [];
  } catch {
    return [];
  }
}
