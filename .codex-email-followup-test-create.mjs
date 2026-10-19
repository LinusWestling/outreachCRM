#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DEFAULT_BASE_URL = "http://127.0.0.1:5168";
const DEFAULT_INPUT_FILE = ".codex-email-followup-test-create.json";

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

  const dryRun = args.includes("--dry-run");
  const inputPath = args.find((arg) => !arg.startsWith("-")) ?? DEFAULT_INPUT_FILE;
  const config = JSON.parse(await readFile(path.resolve(process.cwd(), inputPath), "utf8"));
  const baseUrl = String(config.baseUrl ?? process.env.OUTREACH_API_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const testConfig = validateConfig(config);
  const activeEmailTemplate = await getActiveEmailTemplate(baseUrl);

  if (!activeEmailTemplate?.id) {
    throw new Error("No active Email template is configured.");
  }

  if (dryRun) {
    console.log(JSON.stringify({
      dryRun: true,
      activeEmailTemplateId: activeEmailTemplate.id,
      tests: testConfig.tests.map((test) => ({
        profileUrl: test.profileUrl,
        email: test.email,
        emailSubject: testConfig.emailSubject,
      })),
    }, null, 2));
    return;
  }

  const created = [];
  for (const test of testConfig.tests) {
    const pending = await postJson(`${baseUrl}/api/creators/pending`, {
      profileUrl: test.profileUrl,
      email: test.email,
      followers: 1,
      firstMessageDate: testConfig.firstMessageDate,
    });

    const completed = await postJson(`${baseUrl}/api/creators/pending/${pending.id}/complete`, {
      email: test.email,
      followers: 1,
      messageVersion: "SMTP UTF-8 delivery test",
      messageBody: "Fictional initial outreach used only to create an email delivery test.",
      firstMessageDate: testConfig.firstMessageDate,
      lastContactDate: testConfig.lastContactDate,
    });

    const saved = await putJson(`${baseUrl}/api/creators/${completed.id}`, {
      displayName: test.displayName,
      emailTemplateId: activeEmailTemplate.id,
      emailSubject: testConfig.emailSubject,
      emailBody: testConfig.emailBody,
    });

    created.push({ id: saved.id, profileUrl: saved.profileUrl, email: saved.email });
  }

  const candidates = await getJson(`${baseUrl}/api/creators/email-follow-up-candidates?daysWithoutContact=${testConfig.daysWithoutContact}`);
  const verified = created.map((createdTest) => {
    const candidate = candidates.find((item) => item.id === createdTest.id);
    if (!candidate) {
      throw new Error(`Test record ${createdTest.id} is not available in Todo email follow-ups.`);
    }

    if (candidate.email !== createdTest.email || candidate.emailSubject !== testConfig.emailSubject || candidate.emailBody !== testConfig.emailBody) {
      throw new Error(`Test record ${createdTest.id} did not retain the expected email draft.`);
    }

    return {
      id: candidate.id,
      handle: candidate.handle ?? null,
      email: candidate.email,
      emailSubject: candidate.emailSubject,
      lastContactDate: candidate.lastContactDate,
    };
  });

  console.log(JSON.stringify({ createdCount: created.length, verified }, null, 2));
}

function validateConfig(config) {
  const requiredStrings = ["firstMessageDate", "lastContactDate", "emailSubject", "emailBody"];
  for (const field of requiredStrings) {
    if (typeof config[field] !== "string" || !config[field].trim()) {
      throw new Error(`${field} must be a non-empty string.`);
    }
  }

  if (!Array.isArray(config.tests) || config.tests.length !== 2) {
    throw new Error("tests must contain exactly two fictional email test records.");
  }

  for (const test of config.tests) {
    if (!test || typeof test !== "object" || !String(test.profileUrl ?? "").trim() || !String(test.displayName ?? "").trim() || !String(test.email ?? "").trim()) {
      throw new Error("Each test needs profileUrl, displayName, and email.");
    }
  }

  const daysWithoutContact = Number.parseInt(String(config.daysWithoutContact ?? 7), 10);
  if (!Number.isFinite(daysWithoutContact) || daysWithoutContact < 0) {
    throw new Error("daysWithoutContact must be a non-negative integer.");
  }

  return {
    daysWithoutContact,
    firstMessageDate: config.firstMessageDate.trim(),
    lastContactDate: config.lastContactDate.trim(),
    emailSubject: config.emailSubject.trim(),
    emailBody: config.emailBody.trim(),
    tests: config.tests.map((test) => ({
      profileUrl: test.profileUrl.trim(),
      displayName: test.displayName.trim(),
      email: test.email.trim(),
    })),
  };
}

async function getActiveEmailTemplate(baseUrl) {
  try {
    return await getJson(`${baseUrl}/api/templates/active?kind=Email`);
  } catch (error) {
    const message = String(error?.message ?? "");
    if (!message.includes("404")) {
      throw error;
    }
  }

  const templates = await getJson(`${baseUrl}/api/templates`);
  return templates.find((template) => template.isActive && String(template.kind ?? "").toLowerCase() === "email") ?? null;
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

async function putJson(url, payload) {
  const response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  return parseResponse(response);
}

async function parseResponse(response) {
  const body = await response.text();
  let data = null;
  if (body) {
    try {
      data = JSON.parse(body);
    } catch {
      throw new Error(`${response.status} ${response.statusText}: ${body.slice(0, 1000)}`);
    }
  }

  if (!response.ok) {
    throw new Error(data?.message ?? data?.detail ?? data?.title ?? `${response.status} ${response.statusText}`.trim());
  }

  return data;
}

function printUsage() {
  console.log(`Usage:
  node .codex-email-followup-test-create.mjs [input-json] [--dry-run]

Creates two fictional Todo email tests and verifies their saved drafts.
The command stays stable for Codex approval; only the JSON file changes.`);
}
