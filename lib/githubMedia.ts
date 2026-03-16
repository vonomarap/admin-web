"use client";

export type GithubUrlMode = "raw" | "jsdelivr";

export type GithubMediaConfig = {
  owner: string;
  repo: string;
  branch: string;
  token: string;
  urlMode: GithubUrlMode;
  basePath: string;
};

const CONFIG_KEY = "kanokna.githubMedia.v1";

function normalizePath(value: string): string {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";
  return trimmed.replace(/^\/+|\/+$/g, "").replace(/\/{2,}/g, "/");
}

export function isGithubMediaConfigReady(
  config: GithubMediaConfig | null | undefined
): config is GithubMediaConfig {
  return Boolean(
    config &&
      typeof config.owner === "string" &&
      config.owner.trim() &&
      typeof config.repo === "string" &&
      config.repo.trim() &&
      typeof config.branch === "string" &&
      config.branch.trim() &&
      typeof config.token === "string" &&
      config.token.trim()
  );
}

export function loadGithubMediaConfig(): GithubMediaConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CONFIG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GithubMediaConfig>;

    const owner = typeof parsed.owner === "string" ? parsed.owner.trim() : "";
    const repo = typeof parsed.repo === "string" ? parsed.repo.trim() : "";
    const branch = typeof parsed.branch === "string" ? parsed.branch.trim() : "main";
    const token = typeof parsed.token === "string" ? parsed.token.trim() : "";
    const urlMode: GithubUrlMode = parsed.urlMode === "jsdelivr" ? "jsdelivr" : "raw";
    const basePath = normalizePath(typeof parsed.basePath === "string" ? parsed.basePath : "");

    const config: GithubMediaConfig = { owner, repo, branch, token, urlMode, basePath };
    return config;
  } catch {
    return null;
  }
}

export function saveGithubMediaConfig(next: GithubMediaConfig): void {
  if (typeof window === "undefined") return;

  const normalized: GithubMediaConfig = {
    owner: (next.owner || "").trim(),
    repo: (next.repo || "").trim(),
    branch: (next.branch || "").trim() || "main",
    token: (next.token || "").trim(),
    urlMode: next.urlMode === "jsdelivr" ? "jsdelivr" : "raw",
    basePath: normalizePath(next.basePath || ""),
  };

  window.localStorage.setItem(CONFIG_KEY, JSON.stringify(normalized));
}

export function clearGithubMediaConfig(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(CONFIG_KEY);
}

export function joinGithubPath(basePath: string, path: string): string {
  const base = normalizePath(basePath || "");
  const rel = normalizePath(path || "");
  if (!base) return rel;
  if (!rel) return base;
  return `${base}/${rel}`;
}

function encodeGithubPath(path: string): string {
  const rel = normalizePath(path);
  return rel
    .split("/")
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

function buildPublicUrl(config: GithubMediaConfig, repoPath: string): string {
  const clean = normalizePath(repoPath);
  if (!clean) return "";

  if (config.urlMode === "jsdelivr") {
    return `https://cdn.jsdelivr.net/gh/${config.owner}/${config.repo}@${config.branch}/${clean}`;
  }
  return `https://raw.githubusercontent.com/${config.owner}/${config.repo}/${config.branch}/${clean}`;
}

async function readFileAsBase64(file: File, onProgress?: (pct: number) => void): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.onprogress = (event) => {
      if (!onProgress) return;
      if (event.lengthComputable && event.total > 0) {
        onProgress((event.loaded / event.total) * 55);
      }
    };
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Не удалось прочитать файл"));
        return;
      }
      const comma = result.indexOf(",");
      const base64 = comma >= 0 ? result.slice(comma + 1) : result;
      resolve(base64);
    };
    reader.readAsDataURL(file);
  });
}

async function githubJson<T>(
  config: GithubMediaConfig,
  {
    method,
    apiPath,
    body,
  }: {
    method: "GET" | "PUT" | "DELETE";
    apiPath: string;
    body?: unknown;
  }
): Promise<T> {
  const res = await fetch(`https://api.github.com${apiPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let message = `GitHub API: ${res.status} ${res.statusText}`;
    try {
      const data = (await res.json()) as any;
      if (data?.message) message = `${message}: ${data.message}`;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return (await res.json()) as T;
}

export type GithubFileInfo = {
  path: string;
  sha: string;
  download_url?: string | null;
};

export async function githubGetFileInfo(config: GithubMediaConfig, repoPath: string): Promise<GithubFileInfo> {
  const fullPath = joinGithubPath(config.basePath, repoPath);
  const encodedPath = encodeGithubPath(fullPath);
  const apiPath = `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${encodedPath}?ref=${encodeURIComponent(config.branch)}`;

  const data = await githubJson<any>(config, { method: "GET", apiPath });
  if (!data || typeof data !== "object" || typeof data.sha !== "string") {
    throw new Error("GitHub API: неожиданный ответ (sha не найден)");
  }
  return { path: normalizePath(repoPath), sha: data.sha, download_url: data.download_url ?? null };
}

export async function githubUploadFile({
  config,
  repoPath,
  file,
  message,
  onProgress,
}: {
  config: GithubMediaConfig;
  repoPath: string;
  file: File;
  message?: string;
  onProgress?: (pct: number) => void;
}): Promise<{ path: string; sha: string; url: string }> {
  const normalizedRepoPath = normalizePath(repoPath);
  const fullPath = joinGithubPath(config.basePath, normalizedRepoPath);
  const encodedPath = encodeGithubPath(fullPath);
  const apiPath = `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${encodedPath}`;

  onProgress?.(0);
  const content = await readFileAsBase64(file, onProgress);
  onProgress?.(70);

  const body = {
    message: message || `media: ${file.name || fullPath}`,
    content,
    branch: config.branch,
  };

  const data = await githubJson<any>(config, { method: "PUT", apiPath, body });
  const sha = data?.content?.sha;
  const storedPath = data?.content?.path;
  const downloadUrl = data?.content?.download_url;
  onProgress?.(100);

  const fullStoredPath = typeof storedPath === "string" ? storedPath : fullPath;
  const url =
    typeof downloadUrl === "string" && downloadUrl.startsWith("http")
      ? config.urlMode === "raw"
        ? downloadUrl
        : buildPublicUrl(config, fullStoredPath)
      : buildPublicUrl(config, fullStoredPath);

  if (typeof sha !== "string" || !sha) {
    throw new Error("GitHub API: не удалось получить sha файла");
  }

  return { path: normalizedRepoPath, sha, url };
}

export async function githubDeleteFile({
  config,
  repoPath,
  sha,
  message,
}: {
  config: GithubMediaConfig;
  repoPath: string;
  sha: string;
  message?: string;
}): Promise<void> {
  const fullPath = joinGithubPath(config.basePath, repoPath);
  const encodedPath = encodeGithubPath(fullPath);
  const apiPath = `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${encodedPath}`;

  const body = {
    message: message || `delete media: ${fullPath}`,
    sha,
    branch: config.branch,
  };

  await githubJson<any>(config, { method: "DELETE", apiPath, body });
}

export async function githubTestRepo(config: GithubMediaConfig): Promise<{
  fullName: string;
  isPrivate: boolean;
  defaultBranch: string;
}> {
  const apiPath = `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`;
  const data = await githubJson<any>(config, { method: "GET", apiPath });
  return {
    fullName: String(data?.full_name || `${config.owner}/${config.repo}`),
    isPrivate: Boolean(data?.private),
    defaultBranch: String(data?.default_branch || config.branch || "main"),
  };
}
