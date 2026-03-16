"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { signOut } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
} from "firebase/firestore";
import type { QueryDocumentSnapshot } from "firebase/firestore";
import { auth, db } from "../../lib/firebase";
import { uploadMediaFile, type MediaFolder } from "../../lib/media";
import { useAdminSession } from "../../components/AdminSessionProvider";
import { AdminLoginScreen, LoadingScreen, MissingConfigScreen, NoAccessScreen } from "../../components/AdminScreens";
import { AdminShell } from "../../components/AdminShell";
import {
  clearGithubMediaConfig,
  githubDeleteFile,
  githubGetFileInfo,
  githubTestRepo,
  isGithubMediaConfigReady,
  joinGithubPath,
  loadGithubMediaConfig,
  saveGithubMediaConfig,
  type GithubMediaConfig,
} from "../../lib/githubMedia";
import { loadGithubMediaConfigFromFirestore, saveGithubMediaConfigToFirestore } from "../../lib/githubMediaFirestore";

type MediaItem = {
  id: string;
  url?: string;
  path?: string;
  folder?: string;
  name?: string;
  size?: number;
  contentType?: string;
  createdAt?: any;
  githubSha?: string;
};

const PAGE_SIZE = 40;

const FOLDERS: Array<{ key: MediaFolder; label: string }> = [
  { key: "gallery", label: "Портфолио" },
  { key: "products", label: "Товары" },
  { key: "promos", label: "Акции" },
  { key: "site", label: "Сайт" },
  { key: "misc", label: "Другое" },
];

function folderLabel(value: string): string {
  const found = FOLDERS.find((item) => item.key === value);
  return found?.label ?? value;
}

function formatBytes(value: number | undefined): string {
  const bytes = typeof value === "number" && Number.isFinite(value) ? value : 0;
  if (bytes <= 0) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let idx = 0;
  while (v >= 1024 && idx < units.length - 1) {
    v /= 1024;
    idx += 1;
  }
  const digits = idx === 0 ? 0 : idx === 1 ? 1 : 2;
  return `${v.toFixed(digits)} ${units[idx]}`;
}

async function copyText(value: string): Promise<boolean> {
  const text = value ?? "";
  if (!text) return false;

  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // ignore
  }

  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.left = "-9999px";
    el.style.top = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

function formatCreatedAt(value: any): string {
  if (!value) return "-";
  try {
    const date: Date | null = typeof value?.toDate === "function" ? value.toDate() : value instanceof Date ? value : null;
    if (!date) return "-";
    return date.toLocaleString("ru-RU");
  } catch {
    return "-";
  }
}

export default function MediaPage(): JSX.Element {
  const session = useAdminSession();

  const pickerRef = useRef<HTMLInputElement | null>(null);
  const [uploadFolder, setUploadFolder] = useState<MediaFolder>("gallery");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadInfo, setUploadInfo] = useState<{ index: number; total: number; pct: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [githubConfig, setGithubConfig] = useState<GithubMediaConfig>(() => {
    return (
      loadGithubMediaConfig() ?? {
        owner: "",
        repo: "",
        branch: "main",
        token: "",
        urlMode: "raw",
        basePath: "",
      }
    );
  });
  const [savingGithub, setSavingGithub] = useState(false);
  const [testingGithub, setTestingGithub] = useState(false);
  const [githubNotice, setGithubNotice] = useState<string | null>(null);
  const [githubError, setGithubError] = useState<string | null>(null);

  const [items, setItems] = useState<MediaItem[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const pageCursorRef = useRef<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const loadMedia = useCallback(async ({ mode }: { mode: "reset" | "more" }) => {
    if (!db) return;
    setLoadError(null);
    setLoadingData(true);
    try {
      const base = query(collection(db, "media"), orderBy("createdAt", "desc"));
      const cursor = mode === "more" ? pageCursorRef.current : null;
      const q = cursor ? query(base, startAfter(cursor), limit(PAGE_SIZE)) : query(base, limit(PAGE_SIZE));

      const snap = await getDocs(q);
      const next = snap.docs.map((d): MediaItem => ({ id: d.id, ...(d.data() as Record<string, unknown>) }));
      const nextCursor = snap.docs[snap.docs.length - 1] ?? null;

      pageCursorRef.current = nextCursor;
      setItems((prev) => (mode === "more" ? [...prev, ...next] : next));
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (error) {
      console.error("Admin loadMedia failed:", error);
      setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (session.status !== "ready") return;
    void loadMedia({ mode: "reset" });
  }, [loadMedia, session.status]);

  useEffect(() => {
    if (session.status !== "ready") return;
    if (!db) return;
    let alive = true;
    (async () => {
      try {
        const remote = await loadGithubMediaConfigFromFirestore(db);
        if (!alive || !remote) return;
        setGithubConfig(remote);
        saveGithubMediaConfig(remote);
        setGithubNotice("Настройки GitHub загружены из Firebase.");
      } catch (error) {
        console.error("Admin load GitHub media config failed:", error);
      }
    })();
    return () => {
      alive = false;
    };
  }, [session.status]);

  useEffect(() => {
    if (session.status !== "ready") return;

    const win = window as unknown as { addEventListener?: any; removeEventListener?: any };
    const docRef = document as unknown as { addEventListener?: any; removeEventListener?: any; visibilityState?: string };

    const refresh = () => {
      if (loadingData) return;
      void loadMedia({ mode: "reset" });
    };

    const onVisibility = () => {
      if (docRef.visibilityState === "visible") refresh();
    };

    win.addEventListener?.("focus", refresh);
    docRef.addEventListener?.("visibilitychange", onVisibility);
    return () => {
      win.removeEventListener?.("focus", refresh);
      docRef.removeEventListener?.("visibilitychange", onVisibility);
    };
  }, [loadMedia, loadingData, session.status]);

  const onUploadFiles = async (files: File[]) => {
    if (!files.length) return;
    if (!db) {
      setUploadError("Firebase не настроен.");
      return;
    }
    if (!isGithubMediaConfigReady(githubConfig)) {
      setUploadError("GitHub хранилище не настроено. Заполните настройки GitHub ниже.");
      return;
    }
    saveGithubMediaConfig(githubConfig);
    void saveGithubMediaConfigToFirestore(db, githubConfig).catch((error) =>
      console.error("Admin save GitHub media config failed:", error)
    );

    setUploading(true);
    setUploadError(null);
    setUploadInfo({ index: 0, total: files.length, pct: 0 });
    try {
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i]!;
        setUploadInfo({ index: i + 1, total: files.length, pct: 0 });
        await uploadMediaFile({
          db,
          folder: uploadFolder,
          file,
          userUid: session.user?.uid ?? undefined,
          onProgress: (pct) => setUploadInfo({ index: i + 1, total: files.length, pct }),
        });
      }
      await loadMedia({ mode: "reset" });
    } catch (error) {
      console.error("Media upload failed:", error);
      setUploadError(error instanceof Error ? error.message : String(error));
    } finally {
      setUploading(false);
      setUploadInfo(null);
      if (pickerRef.current) pickerRef.current.value = "";
    }
  };

  const onPick = (list: FileList | null) => {
    if (!list?.length) return;
    void onUploadFiles(Array.from(list));
  };

  const onDelete = async (item: MediaItem) => {
    if (!db) return;
    const title = item.name || item.path || item.id;
    const ok = confirm(`Удалить файл "${title}"? Это действие необратимо.`);
    if (!ok) return;

    if (!isGithubMediaConfigReady(githubConfig)) {
      alert("GitHub хранилище не настроено. Сначала сохраните настройки GitHub.");
      return;
    }

    try {
      const repoPath = typeof item.path === "string" ? item.path : "";
      if (repoPath) {
        const sha = typeof item.githubSha === "string" && item.githubSha ? item.githubSha : "";
        const effectiveSha = sha ? sha : (await githubGetFileInfo(githubConfig, repoPath)).sha;
        await githubDeleteFile({ config: githubConfig, repoPath, sha: effectiveSha });
      }
      await deleteDoc(doc(db, "media", item.id));
      await loadMedia({ mode: "reset" });
    } catch (error) {
      console.error("Media delete failed:", error);
      alert(error instanceof Error ? error.message : String(error));
    }
  };

  const githubReady = useMemo(() => isGithubMediaConfigReady(githubConfig), [githubConfig]);
  const canUpload = useMemo(() => Boolean(db && session.isAdmin && githubReady), [githubReady, session.isAdmin]);

  const fullPathPreview = useMemo(() => {
    const prefix = githubConfig?.basePath ? joinGithubPath(githubConfig.basePath, "") : "";
    const base = prefix ? `${prefix}/` : "";
    return `/${base}media/${uploadFolder}/...`;
  }, [githubConfig.basePath, uploadFolder]);

  const saveGithub = async () => {
    setGithubNotice(null);
    setGithubError(null);
    setSavingGithub(true);
    try {
      if (!db) throw new Error("Firebase не настроен.");
      await saveGithubMediaConfigToFirestore(db, githubConfig);
      saveGithubMediaConfig(githubConfig);
      setGithubNotice("Настройки сохранены в Firebase (только для админов) и на этом устройстве.");
    } catch (error) {
      setGithubError(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingGithub(false);
    }
  };

  const clearGithub = async () => {
    const ok = confirm("Очистить настройки GitHub на этом устройстве?");
    if (!ok) return;
    clearGithubMediaConfig();
    setGithubConfig({
      owner: "",
      repo: "",
      branch: "main",
      token: "",
      urlMode: "raw",
      basePath: "",
    });
    setGithubNotice("Настройки очищены.");
    setGithubError(null);
  };

  const testGithub = async () => {
    setGithubNotice(null);
    setGithubError(null);
    setTestingGithub(true);
    try {
      if (!isGithubMediaConfigReady(githubConfig)) {
        throw new Error("Заполните owner/repo/branch/token.");
      }
      const info = await githubTestRepo(githubConfig);
      const privacy = info.isPrivate ? "PRIVATE" : "PUBLIC";
      const note = info.isPrivate
        ? `Репозиторий ${info.fullName} (${privacy}). ВАЖНО: для сайта изображения должны быть публичными.`
        : `OK: ${info.fullName} (${privacy}).`;
      setGithubNotice(note);
    } catch (error) {
      setGithubError(error instanceof Error ? error.message : String(error));
    } finally {
      setTestingGithub(false);
    }
  };

  const uploadPanel = (
    <div className="editPanel">
      <div className="editGrid">
        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <div className="fieldLabel">GitHub (хранилище изображений)</div>
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <input
                placeholder="owner (например: my-username)"
                value={githubConfig.owner}
                onChange={(e) => setGithubConfig((prev) => ({ ...prev, owner: e.target.value }))}
                disabled={savingGithub || testingGithub}
              />
              <input
                placeholder="repo (например: kanokna-media)"
                value={githubConfig.repo}
                onChange={(e) => setGithubConfig((prev) => ({ ...prev, repo: e.target.value }))}
                disabled={savingGithub || testingGithub}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <input
                placeholder="branch (например: main)"
                value={githubConfig.branch}
                onChange={(e) => setGithubConfig((prev) => ({ ...prev, branch: e.target.value }))}
                disabled={savingGithub || testingGithub}
              />
              <select
                value={githubConfig.urlMode}
                onChange={(e) => setGithubConfig((prev) => ({ ...prev, urlMode: e.target.value as any }))}
                disabled={savingGithub || testingGithub}
              >
                <option value="raw">raw.githubusercontent.com</option>
                <option value="jsdelivr">jsDelivr (CDN)</option>
              </select>
            </div>

            <input
              type="password"
              placeholder="token (fine-grained PAT с доступом к Contents: Read and write)"
              value={githubConfig.token}
              onChange={(e) => setGithubConfig((prev) => ({ ...prev, token: e.target.value }))}
              disabled={savingGithub || testingGithub}
            />

            <details>
              <summary style={{ cursor: "pointer" }}>Дополнительно</summary>
              <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                <input
                  placeholder='Папка в репозитории (опционально), например: "assets"'
                  value={githubConfig.basePath}
                  onChange={(e) => setGithubConfig((prev) => ({ ...prev, basePath: e.target.value }))}
                  disabled={savingGithub || testingGithub}
                />
                <small>
                  Обычно оставьте пустым. Тогда файлы будут лежать в <span className="breakLong">/media/...</span>
                </small>
              </div>
            </details>

            <div className="rowActions" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="secondary" onClick={() => void testGithub()} disabled={testingGithub || savingGithub}>
                Проверить
              </button>
              <button type="button" className="secondary" onClick={() => void saveGithub()} disabled={savingGithub}>
                Сохранить
              </button>
              <button type="button" className="danger" onClick={() => void clearGithub()} disabled={savingGithub || testingGithub}>
                Очистить
              </button>
            </div>

            {githubNotice ? <small>{githubNotice}</small> : null}
            {githubError ? <div className="errorBox">{githubError}</div> : null}
          </div>
        </div>

        <div className="field">
          <div className="fieldLabel">Папка</div>
          <select value={uploadFolder} onChange={(e) => setUploadFolder(e.target.value as MediaFolder)} disabled={uploading}>
            {FOLDERS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
          <small>
            Файлы сохраняются в GitHub:{" "}
            <span className="breakLong">
              {githubReady ? `${githubConfig.owner}/${githubConfig.repo} (${githubConfig.branch})` : "не настроено"}
            </span>{" "}
            → <span className="breakLong">{fullPathPreview}</span>
          </small>
        </div>

        <div className="field">
          <div className="fieldLabel">Загрузка</div>
          <input
            ref={pickerRef}
            type="file"
            accept="image/*"
            multiple
            disabled={!canUpload || uploading}
            onChange={(e) => onPick(e.currentTarget.files)}
          />
          <small>Можно выбрать сразу несколько файлов.</small>
        </div>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!canUpload || uploading) return;
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!canUpload || uploading) return;
          const files = Array.from(e.dataTransfer.files || []).filter((file) => file.type.startsWith("image/"));
          void onUploadFiles(files);
        }}
        style={{
          padding: 12,
          borderRadius: 16,
          border: `1px dashed ${dragOver ? "rgba(249, 115, 22, 0.55)" : "rgba(11, 18, 32, 0.18)"}`,
          background: dragOver ? "rgba(249, 115, 22, 0.08)" : "rgba(255, 255, 255, 0.08)",
          textAlign: "center",
          userSelect: "none",
        }}
      >
        <b>Перетащите фото сюда</b>
        <div>
          <small>Только изображения (image/*)</small>
        </div>
      </div>

      {uploadInfo ? (
        <small>
          Загрузка {uploadInfo.index}/{uploadInfo.total} · {Math.round(uploadInfo.pct)}%
        </small>
      ) : null}

      {uploadError ? <div className="errorBox">{uploadError}</div> : null}
    </div>
  );

  if (session.status === "loading") return <LoadingScreen />;
  if (session.status === "missing_config") return <MissingConfigScreen />;
  if (session.status === "signed_out") return <AdminLoginScreen title="Медиа" subtitle="Войдите под админским аккаунтом" />;
  if (session.status === "not_admin" || session.status === "role_check_failed") return <NoAccessScreen />;

  return (
    <AdminShell
      title="Медиа"
      subtitle={session.user?.email ?? ""}
      rightActions={
        <>
          <button className="secondary" onClick={() => pickerRef.current?.click()} disabled={!canUpload || uploading}>
            Загрузить
          </button>
          <button className="secondary" onClick={() => void loadMedia({ mode: "reset" })} disabled={loadingData}>
            Обновить
          </button>
          <button onClick={() => void signOut(auth!)} disabled={!auth}>
            Выйти
          </button>
        </>
      }
    >
      {loadError ? (
        <section className="card noticeCard noticeCard-error">
          <h3 style={{ marginBottom: 6 }}>Ошибка загрузки данных</h3>
          <small className="noticeText-danger">{loadError}</small>
        </section>
      ) : null}

      <section className="card">
        <div className="rowActions" style={{ justifyContent: "space-between" }}>
          <div style={{ display: "grid", gap: 2 }}>
            <h2>Загрузка файлов</h2>
            <small>Ссылки можно использовать в товарах, галерее, акциях и настройках сайта.</small>
          </div>
          <small>Доступ: только админ.</small>
        </div>
        {uploadPanel}
      </section>

      <section className="card">
        <div className="rowActions" style={{ justifyContent: "space-between" }}>
          <div style={{ display: "grid", gap: 2 }}>
            <h2>Файлы</h2>
            <small>{items.length} шт.</small>
          </div>
          <div className="rowActions">
            {hasMore ? (
              <button className="secondary" onClick={() => void loadMedia({ mode: "more" })} disabled={loadingData}>
                Ещё
              </button>
            ) : null}
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          {items.length ? (
            <div className="cardList">
              {items.map((item) => {
                const url = typeof item.url === "string" ? item.url : "";
                const path = typeof item.path === "string" ? item.path : "";
                const folderKey = typeof item.folder === "string" ? item.folder : "";
                const folder = folderKey ? folderLabel(folderKey) : "-";
                const name = typeof item.name === "string" ? item.name : item.id;

                return (
                  <div key={item.id} className="itemCard">
                    <div className="itemHeader">
                      <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
                        <b className="breakLong">{name}</b>
                        <small className="breakLong">{path || item.id}</small>
                      </div>
                      <span className="badge">{folder}</span>
                    </div>

                    <div className="rowActions" style={{ alignItems: "flex-start", gap: 12 }}>
                      <div
                        style={{
                          width: 84,
                          height: 84,
                          borderRadius: 16,
                          border: "1px solid rgba(249, 115, 22, 0.18)",
                          background: "rgba(255, 255, 255, 0.08)",
                          overflow: "hidden",
                          flex: "0 0 auto",
                        }}
                        title={url || undefined}
                      >
                        {url ? (
                          <img
                            src={url}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            referrerPolicy="no-referrer"
                            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                          />
                        ) : null}
                      </div>

                      <div className="kv" style={{ flex: 1, minWidth: 0 }}>
                        <div className="kvRow">
                          <div className="kvLabel">Размер</div>
                          <div className="kvValue">{formatBytes(item.size)}</div>
                        </div>
                        <div className="kvRow">
                          <div className="kvLabel">Тип</div>
                          <div className="kvValue">{item.contentType || "-"}</div>
                        </div>
                        <div className="kvRow">
                          <div className="kvLabel">Дата</div>
                          <div className="kvValue">{formatCreatedAt(item.createdAt)}</div>
                        </div>
                        <div className="kvRow">
                          <div className="kvLabel">URL</div>
                          <div className="kvValue breakLong">{url || "-"}</div>
                        </div>
                      </div>
                    </div>

                    <div className="rowActions" style={{ justifyContent: "flex-end" }}>
                      {url ? (
                        <Fragment>
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => void copyText(url)}
                          >
                            Копировать URL
                          </button>
                          <button type="button" className="secondary" onClick={() => window.open(url, "_blank")}>
                            Открыть
                          </button>
                        </Fragment>
                      ) : null}
                      <button type="button" className="danger" onClick={() => void onDelete(item)}>
                        Удалить
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : loadingData ? (
            <small>Загрузка…</small>
          ) : (
            <small>Пока нет файлов. Загрузите фото выше.</small>
          )}
        </div>
      </section>
    </AdminShell>
  );
}
