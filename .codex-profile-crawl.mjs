#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DEFAULT_INPUT_FILE = ".codex-profile-crawl.json";
const INSTAGRAM_APP_ID = "936619743392459";
const ALLOWED_HOSTS = [
  "instagram.com",
  "www.instagram.com",
  "tiktok.com",
  "www.tiktok.com",
  "m.tiktok.com",
  "vm.tiktok.com",
];

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

  const inputPath = args.find((arg) => !arg.startsWith("-")) ?? DEFAULT_INPUT_FILE;
  const absoluteInputPath = path.resolve(process.cwd(), inputPath);
  const input = JSON.parse(await readFile(absoluteInputPath, "utf8"));
  const profiles = normalizeProfiles(input);

  if (profiles.length === 0) {
    throw new Error(`No profile URLs found in ${inputPath}.`);
  }

  const results = [];
  for (const profile of profiles) {
    results.push(await crawlProfile(profile));
  }

  console.log(JSON.stringify({ accessMethod: "crawler-only", count: results.length, results }, null, 2));
}

function normalizeProfiles(input) {
  const rawProfiles = Array.isArray(input) ? input : input.profiles ?? input.urls ?? [];

  if (!Array.isArray(rawProfiles)) {
    throw new Error("Input must be an array, or an object with a profiles/urls array.");
  }

  return rawProfiles.map((item) => {
    if (typeof item === "string") {
      return { url: item };
    }

    if (item && typeof item === "object" && typeof item.url === "string") {
      return { id: item.id ?? null, handle: item.handle ?? null, url: item.url };
    }

    throw new Error(`Invalid profile entry: ${JSON.stringify(item)}`);
  });
}

async function crawlProfile(profile) {
  const url = validateProfileUrl(profile.url);
  const hostname = new URL(url).hostname.toLowerCase();
  if (hostname.includes("instagram.com")) {
    return await crawlInstagramProfile(profile, url);
  }

  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36",
    },
  });

  const html = await response.text();
  const meta = extractMeta(html);
  const profileData = extractProfileData(html, url);
  return {
    id: profile.id,
    handle: profile.handle,
    url,
    finalUrl: response.url,
    status: response.status,
    ok: response.ok,
    title: cleanText(meta.title),
    description: cleanText(meta.description),
    ogTitle: cleanText(meta.ogTitle),
    ogDescription: cleanText(meta.ogDescription),
    displayName: cleanText(profileData.displayName),
    bio: cleanText(profileData.bio),
    followers: profileData.followers,
    following: profileData.following,
    likes: profileData.likes,
    videos: profileData.videos,
    profileDataSource: profileData.source,
    emailCandidates: uniqueMatches(html, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi),
    threadsLinks: uniqueMatches(html, /https?:\/\/(?:www\.)?threads\.(?:com|net)\/@[A-Za-z0-9._-]+/gi),
    threadsMentions: uniqueMatches(html, /threads\.(?:com|net)\/@[A-Za-z0-9._-]+|Threads\s*[:@]\s*@?[A-Za-z0-9._-]+/gi),
  };
}

async function crawlInstagramProfile(profile, url) {
  const username = profileHandleFromUrl(url);
  if (!username) {
    throw new Error(`Instagram profile URL is missing a handle: ${url}`);
  }

  const pageFirst = await crawlInstagramProfilePage(profile, url, username, null, null);
  if (pageFirst.ok && hasInstagramResultFields(pageFirst)) {
    return pageFirst;
  }

  const apiUrl = new URL("https://www.instagram.com/api/v1/users/web_profile_info/");
  apiUrl.searchParams.set("username", username);

  const response = await fetch(apiUrl, {
    redirect: "follow",
    headers: {
      "Accept": "application/json",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
      "Referer": url.endsWith("/") ? url : `${url}/`,
      "User-Agent": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36",
      "X-ASBD-ID": "129477",
      "X-IG-App-ID": INSTAGRAM_APP_ID,
      "X-Requested-With": "XMLHttpRequest",
    },
  });

  const body = await response.text();
  const json = safeJson(body);
  const profileData = normalizeInstagramWebProfileInfo(json, username);
  if (!hasInstagramProfileFields(profileData, username)) {
    return await crawlInstagramProfilePage(profile, url, username, response, profileData);
  }
  const bio = profileData.bio ?? "";

  return {
    id: profile.id,
    handle: profile.handle,
    url,
    finalUrl: response.url,
    status: response.status,
    ok: response.ok,
    title: null,
    description: null,
    ogTitle: null,
    ogDescription: null,
    displayName: cleanText(profileData.displayName),
    bio: cleanText(profileData.bio),
    followers: profileData.followers,
    following: profileData.following,
    likes: null,
    videos: null,
    profileDataSource: profileData.source,
    emailCandidates: uniqueMatches(bio, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi),
    threadsLinks: uniqueMatches(bio, /https?:\/\/(?:www\.)?threads\.(?:com|net)\/@[A-Za-z0-9._-]+/gi),
    threadsMentions: uniqueMatches(bio, /threads\.(?:com|net)\/@[A-Za-z0-9._-]+|Threads\s*[:@]\s*@?[A-Za-z0-9._-]+/gi),
    isPrivate: profileData.isPrivate,
    isVerified: profileData.isVerified,
    externalUrl: profileData.externalUrl,
    pageStatus: pageFirst.status,
    pageOk: pageFirst.ok,
    pageProfileDataSource: pageFirst.profileDataSource,
  };
}

async function crawlInstagramProfilePage(profile, url, username, apiResponse, apiProfileData) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36",
    },
  });
  const html = await response.text();
  const meta = extractMeta(html);
  const title = cleanText(meta.title);
  const description = cleanText(meta.description);
  const profileData = extractInstagramProfilePageData(html, username);
  const profileSpecific = hasInstagramProfileFields(profileData, username)
    || Boolean(title && title.toLowerCase() !== "instagram");
  const bio = profileData.bio ?? "";

  return {
    id: profile.id,
    handle: profile.handle,
    url,
    finalUrl: response.url,
    status: response.status,
    ok: response.ok && profileSpecific,
    title,
    description,
    ogTitle: cleanText(meta.ogTitle),
    ogDescription: cleanText(meta.ogDescription),
    displayName: cleanText(profileData.displayName),
    bio: cleanText(profileData.bio),
    followers: profileData.followers,
    following: profileData.following,
    isPrivate: profileData.isPrivate,
    isVerified: profileData.isVerified,
    externalUrl: profileData.externalUrl,
    profileDataSource: profileData.source
      ?? (profileSpecific ? "instagram-profile-page-html" : "instagram-profile-page-html-generic"),
    apiStatus: apiResponse?.status ?? null,
    apiProfileDataSource: apiProfileData?.source ?? null,
    emailCandidates: uniqueMatches(`${bio}\n${html}`, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi),
    threadsLinks: uniqueMatches(`${bio}\n${html}`, /https?:\/\/(?:www\.)?threads\.(?:com|net)\/@[A-Za-z0-9._-]+/gi),
    threadsMentions: uniqueMatches(`${bio}\n${html}`, /threads\.(?:com|net)\/@[A-Za-z0-9._-]+|Threads\s*[:@]\s*@?[A-Za-z0-9._-]+/gi),
  };
}

function extractInstagramProfilePageData(html, expectedHandle) {
  const scriptPattern = /<script\b[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(scriptPattern)) {
    const json = safeJson(decodeEntities(match[1]));
    const user = findInstagramUser(json, expectedHandle);
    if (user) {
      return normalizeEmbeddedInstagramUser(user);
    }
  }

  return {
    ...emptyProfileData(),
    username: null,
    isPrivate: null,
    isVerified: null,
    externalUrl: null,
  };
}

function findInstagramUser(value, expectedHandle, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) {
    return null;
  }
  seen.add(value);

  if (!Array.isArray(value) && matchesExpectedHandle(value.username, expectedHandle)) {
    const hasProfileShape = value.full_name != null
      || value.biography != null
      || value.edge_followed_by != null
      || value.follower_count != null
      || value.is_private != null
      || value.is_verified != null;
    if (hasProfileShape) {
      return value;
    }
  }

  for (const child of Object.values(value)) {
    const user = findInstagramUser(child, expectedHandle, seen);
    if (user) {
      return user;
    }
  }
  return null;
}

function normalizeEmbeddedInstagramUser(user) {
  return {
    username: stringValue(user.username),
    displayName: stringValue(user.full_name ?? user.fullName),
    bio: stringValue(user.biography ?? user.bio),
    followers: numberValue(user.edge_followed_by?.count ?? user.follower_count ?? user.followerCount),
    following: numberValue(user.edge_follow?.count ?? user.following_count ?? user.followingCount),
    likes: null,
    videos: null,
    source: "instagram-profile-page-embedded-json",
    isPrivate: booleanValue(user.is_private ?? user.isPrivate),
    isVerified: booleanValue(user.is_verified ?? user.isVerified),
    externalUrl: stringValue(user.external_url ?? user.externalUrl),
  };
}

function hasInstagramProfileFields(profileData, username) {
  return matchesExpectedHandle(profileData?.username, username) && Boolean(
    profileData.displayName || profileData.bio || profileData.followers != null || profileData.isPrivate != null || profileData.isVerified != null,
  );
}

function hasInstagramResultFields(profileData) {
  return Boolean(
    profileData?.displayName || profileData?.bio || profileData?.followers != null || profileData?.isPrivate != null || profileData?.isVerified != null,
  );
}

function validateProfileUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid profile URL: ${value}`);
  }

  if (url.protocol !== "https:") {
    throw new Error(`Only https profile URLs are allowed: ${value}`);
  }

  if (!ALLOWED_HOSTS.includes(url.hostname.toLowerCase())) {
    throw new Error(`Only exact Instagram/TikTok profile URLs are allowed: ${value}`);
  }

  return url.toString();
}

function extractMeta(html) {
  const title = firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  return {
    title,
    description: metaContent(html, "name", "description"),
    ogTitle: metaContent(html, "property", "og:title"),
    ogDescription: metaContent(html, "property", "og:description"),
  };
}

function extractProfileData(html, url) {
  const hostname = new URL(url).hostname.toLowerCase();
  if (hostname.includes("tiktok.com")) {
    return extractTikTokProfileData(html, url);
  }

  return emptyProfileData();
}

function extractTikTokProfileData(html, url) {
  const expectedHandle = profileHandleFromUrl(url);
  const universal = parseJsonScriptById(html, "__UNIVERSAL_DATA_FOR_REHYDRATION__");
  const universalUserInfo = universal?.__DEFAULT_SCOPE__?.["webapp.user-detail"]?.userInfo;
  const fromUniversal = normalizeTikTokUserInfo(universalUserInfo, expectedHandle, "__UNIVERSAL_DATA_FOR_REHYDRATION__");
  if (fromUniversal.source) {
    return fromUniversal;
  }

  const sigi = parseJsonScriptById(html, "SIGI_STATE");
  const fromSigi = normalizeSigiState(sigi, expectedHandle);
  if (fromSigi.source) {
    return fromSigi;
  }

  return extractTikTokFallbackFields(html, expectedHandle);
}

function normalizeTikTokUserInfo(userInfo, expectedHandle, source) {
  if (!userInfo || typeof userInfo !== "object") {
    return emptyProfileData();
  }

  const user = userInfo.user;
  const stats = userInfo.stats;
  if (!matchesExpectedHandle(user?.uniqueId, expectedHandle)) {
    return emptyProfileData();
  }

  return {
    displayName: stringValue(user?.nickname),
    bio: stringValue(user?.signature),
    followers: numberValue(stats?.followerCount),
    following: numberValue(stats?.followingCount),
    likes: numberValue(stats?.heartCount),
    videos: numberValue(stats?.videoCount),
    source,
  };
}

function normalizeSigiState(sigi, expectedHandle) {
  const users = sigi?.UserModule?.users;
  const stats = sigi?.UserModule?.stats;
  if (!users || typeof users !== "object") {
    return emptyProfileData();
  }

  const user = Object.values(users).find((item) => matchesExpectedHandle(item?.uniqueId, expectedHandle));
  if (!user) {
    return emptyProfileData();
  }

  const userStats = stats?.[user.id] ?? stats?.[user.uniqueId] ?? null;
  return {
    displayName: stringValue(user.nickname),
    bio: stringValue(user.signature),
    followers: numberValue(userStats?.followerCount),
    following: numberValue(userStats?.followingCount),
    likes: numberValue(userStats?.heartCount),
    videos: numberValue(userStats?.videoCount),
    source: "SIGI_STATE",
  };
}

function extractTikTokFallbackFields(html, expectedHandle) {
  const uniqueId = firstMatch(html, /"uniqueId"\s*:\s*"([^"]+)"/);
  if (!matchesExpectedHandle(uniqueId, expectedHandle)) {
    return emptyProfileData();
  }

  const followers = numberValue(firstMatch(html, /"followerCount"\s*:\s*(\d+)/));
  if (followers === null) {
    return emptyProfileData();
  }

  return {
    displayName: cleanText(firstMatch(html, /"nickname"\s*:\s*"([^"]*)"/)),
    bio: cleanText(firstMatch(html, /"signature"\s*:\s*"([^"]*)"/)),
    followers,
    following: numberValue(firstMatch(html, /"followingCount"\s*:\s*(\d+)/)),
    likes: numberValue(firstMatch(html, /"heartCount"\s*:\s*(\d+)/)),
    videos: numberValue(firstMatch(html, /"videoCount"\s*:\s*(\d+)/)),
    source: "fallback-profile-json-fields",
  };
}

function normalizeInstagramWebProfileInfo(json, expectedHandle) {
  const user = json?.data?.user;
  if (!user || typeof user !== "object" || !matchesExpectedHandle(user.username, expectedHandle)) {
    return {
      ...emptyProfileData(),
      username: null,
      isPrivate: null,
      isVerified: null,
      externalUrl: null,
    };
  }

  return {
    username: stringValue(user.username),
    displayName: stringValue(user.full_name),
    bio: stringValue(user.biography),
    followers: numberValue(user.edge_followed_by?.count),
    following: numberValue(user.edge_follow?.count),
    likes: null,
    videos: null,
    source: "instagram-web-profile-info-api",
    isPrivate: booleanValue(user.is_private),
    isVerified: booleanValue(user.is_verified),
    externalUrl: stringValue(user.external_url),
  };
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function parseJsonScriptById(html, id) {
  const pattern = new RegExp(`<script\\b[^>]*id=["']${escapeRegExp(id)}["'][^>]*>([\\s\\S]*?)<\\/script>`, "i");
  const content = firstMatch(html, pattern);
  if (!content) {
    return null;
  }

  try {
    return JSON.parse(decodeEntities(content));
  } catch {
    return null;
  }
}

function profileHandleFromUrl(url) {
  const pathname = new URL(url).pathname;
  const [segment] = pathname.split("/").filter(Boolean);
  if (!segment) {
    return null;
  }

  return decodeURIComponent(segment.startsWith("@") ? segment.slice(1) : segment);
}

function matchesExpectedHandle(value, expectedHandle) {
  if (!expectedHandle || !value) {
    return false;
  }

  return String(value).toLowerCase() === String(expectedHandle).toLowerCase();
}

function stringValue(value) {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && /^\d+$/.test(value)) {
    return Number(value);
  }

  return null;
}

function booleanValue(value) {
  return typeof value === "boolean" ? value : null;
}

function emptyProfileData() {
  return {
    displayName: null,
    bio: null,
    followers: null,
    following: null,
    likes: null,
    videos: null,
    source: null,
  };
}

function metaContent(html, attrName, attrValue) {
  const tagPattern = /<meta\b[^>]*>/gi;
  for (const [tag] of html.matchAll(tagPattern)) {
    if (getAttribute(tag, attrName)?.toLowerCase() === attrValue.toLowerCase()) {
      return getAttribute(tag, "content");
    }
  }

  return null;
}

function getAttribute(tag, name) {
  const pattern = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'=<>` + "`" + `]+))`, "i");
  const match = pattern.exec(tag);
  return match ? decodeEntities(match[2] ?? match[3] ?? match[4] ?? "") : null;
}

function firstMatch(value, pattern) {
  const match = pattern.exec(value);
  return match ? decodeEntities(match[1]) : null;
}

function uniqueMatches(value, pattern) {
  return [...new Set([...value.matchAll(pattern)].map((match) => decodeEntities(match[0]).trim()))];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanText(value) {
  return value?.replace(/\s+/g, " ").trim() || null;
}

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function printUsage() {
  console.log(`Usage:
  node .codex-profile-crawl.mjs [input-json]

Default input file:
  ${DEFAULT_INPUT_FILE}

Example input:
  {
    "profiles": [
      {
        "id": "00000000-0000-0000-0000-000000000001",
        "handle": "example",
        "url": "https://www.instagram.com/example/"
      }
    ]
  }

The command stays stable for Codex approval; only the JSON file changes.`);
}
