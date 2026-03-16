"use client";

import type { Firestore } from "firebase/firestore";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import {
  githubUploadFile,
  isGithubMediaConfigReady,
  loadGithubMediaConfig,
  saveGithubMediaConfig,
  type GithubMediaConfig,
  type GithubUrlMode,
} from "./githubMedia";
import { loadGithubMediaConfigFromFirestore } from "./githubMediaFirestore";

export type MediaFolder = "gallery" | "products" | "promos" | "site" | "misc";

export type MediaDoc = {
  path: string;
  url: string;
  provider?: "github";
  githubSha?: string;
  githubOwner?: string;
  githubRepo?: string;
  githubBranch?: string;
  githubUrlMode?: GithubUrlMode;
  folder: MediaFolder;
  name: string;
  contentType?: string;
  size?: number;
  createdAt: unknown;
  createdByUid?: string;
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function safeAscii(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

export function sanitizeFileName(name: string): string {
  const trimmed = String(name || "").trim();
  if (!trimmed) return "file";
  const ascii = safeAscii(trimmed);
  return ascii ? ascii.slice(0, 120) : "file";
}

export function buildMediaPath({
  folder,
  fileName,
  now = new Date(),
}: {
  folder: MediaFolder;
  fileName: string;
  now?: Date;
}): string {
  const yyyy = now.getUTCFullYear();
  const mm = pad2(now.getUTCMonth() + 1);
  const ts = now.getTime();
  const rand = Math.random().toString(36).slice(2, 10);
  const safe = sanitizeFileName(fileName);
  return `media/${folder}/${yyyy}/${mm}/${ts}_${rand}_${safe}`;
}

let cachedGithubConfig: GithubMediaConfig | null = null;
let cachedGithubConfigAt = 0;
const GITHUB_CONFIG_CACHE_TTL_MS = 2 * 60 * 1000;

async function resolveGithubMediaConfig(db: Firestore): Promise<GithubMediaConfig> {
  const now = Date.now();
  if (cachedGithubConfig && now - cachedGithubConfigAt < GITHUB_CONFIG_CACHE_TTL_MS && isGithubMediaConfigReady(cachedGithubConfig)) {
    return cachedGithubConfig;
  }

  const local = loadGithubMediaConfig();
  if (isGithubMediaConfigReady(local)) {
    cachedGithubConfig = local;
    cachedGithubConfigAt = now;
    return local;
  }

  const remote = await loadGithubMediaConfigFromFirestore(db);
  if (isGithubMediaConfigReady(remote)) {
    cachedGithubConfig = remote;
    cachedGithubConfigAt = now;
    saveGithubMediaConfig(remote);
    return remote;
  }

  throw new Error('GitHub хранилище не настроено. Откройте "Медиа" и заполните настройки GitHub.');
}

export async function uploadMediaFile({
  db,
  folder,
  file,
  userUid,
  onProgress,
}: {
  db: Firestore;
  folder: MediaFolder;
  file: File;
  userUid?: string;
  onProgress?: (pct: number) => void;
}): Promise<{ url: string; path: string; docId: string }> {
  const config = await resolveGithubMediaConfig(db);

  const path = buildMediaPath({ folder, fileName: file.name });
  const uploaded = await githubUploadFile({
    config,
    repoPath: path,
    file,
    onProgress,
  });
  const url = uploaded.url;

  const docRef = await addDoc(collection(db, "media"), {
    path: uploaded.path,
    url,
    provider: "github",
    githubSha: uploaded.sha,
    githubOwner: config.owner,
    githubRepo: config.repo,
    githubBranch: config.branch,
    githubUrlMode: config.urlMode,
    folder,
    name: file.name,
    contentType: file.type || undefined,
    size: typeof file.size === "number" ? file.size : undefined,
    createdAt: serverTimestamp(),
    createdByUid: userUid || undefined,
  } satisfies MediaDoc);

  return { url, path: uploaded.path, docId: docRef.id };
}
