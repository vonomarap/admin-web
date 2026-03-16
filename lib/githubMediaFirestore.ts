"use client";

import type { Firestore } from "firebase/firestore";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import type { GithubMediaConfig, GithubUrlMode } from "./githubMedia";

const DOC_COLLECTION = "admin_settings";
const DOC_ID = "github_media";

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asUrlMode(value: unknown): GithubUrlMode {
  return value === "jsdelivr" ? "jsdelivr" : "raw";
}

export async function loadGithubMediaConfigFromFirestore(db: Firestore): Promise<GithubMediaConfig | null> {
  const ref = doc(db, DOC_COLLECTION, DOC_ID);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  const data = snap.data() as Record<string, unknown>;

  return {
    owner: asString(data.owner).trim(),
    repo: asString(data.repo).trim(),
    branch: asString(data.branch).trim() || "main",
    token: asString(data.token).trim(),
    urlMode: asUrlMode(data.urlMode),
    basePath: asString(data.basePath).trim(),
  };
}

export async function saveGithubMediaConfigToFirestore(db: Firestore, config: GithubMediaConfig): Promise<void> {
  const ref = doc(db, DOC_COLLECTION, DOC_ID);
  await setDoc(
    ref,
    {
      owner: (config.owner || "").trim(),
      repo: (config.repo || "").trim(),
      branch: (config.branch || "").trim() || "main",
      token: (config.token || "").trim(),
      urlMode: config.urlMode === "jsdelivr" ? "jsdelivr" : "raw",
      basePath: (config.basePath || "").trim(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

