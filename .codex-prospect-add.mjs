#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DEFAULT_BASE_URL = "http://127.0.0.1:5168";
const DEFAULT_INPUT_FILE = ".codex-prospect-add.json";

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

async function main() {
  const inputPath = process.argv[2] ?? DEFAULT_INPUT_FILE;
  const config = JSON.parse(await readFile(path.resolve(process.cwd(), inputPath), "utf8"));
  const baseUrl = String(config.baseUrl ?? process.env.OUTREACH_API_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const profileUrls = validateProfileUrls(config.profileUrls);
  const results = [];

  for (const profileUrl of profileUrls) {
    const response = await fetch(`${baseUrl}/api/creators/pending`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ profileUrl }),
    });
    const body = await readResponseBody(response);

    results.push({
      profileUrl,
      status: response.status,
      ok: response.ok,
      id: response.ok ? body?.id ?? null : null,
      message: response.ok
        ? null
        : body?.message ?? body?.detail ?? body?.title ?? response.statusText,
    });
  }

  console.log(JSON.stringify({
    requestedCount: profileUrls.length,
    addedCount: results.filter((result) => result.ok).length,
    rejectedCount: results.filter((result) => !result.ok).length,
    results,
  }, null, 2));
}

function validateProfileUrls(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("profileUrls must be a non-empty array.");
  }

  const profileUrls = value.map((item) => String(item ?? "").trim());
  const supportedProfileUrl = /^https:\/\/www\.(?:tiktok\.com\/@[^/?#]+|instagram\.com\/[A-Za-z0-9._]+)\/?$/;
  if (profileUrls.some((item) => !supportedProfileUrl.test(item))) {
    throw new Error("Every profile URL must be an exact HTTPS TikTok or Instagram profile URL.");
  }

  if (new Set(profileUrls.map((item) => item.toLowerCase())).size !== profileUrls.length) {
    throw new Error("profileUrls contains duplicates.");
  }

  return profileUrls;
}

async function readResponseBody(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 1000) };
  }
}
