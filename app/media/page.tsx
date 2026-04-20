"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImageIcon, Upload } from "lucide-react";
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
import { toast } from "sonner";
import { db } from "../../lib/firebase";
import { uploadMediaFile, type MediaFolder } from "../../lib/media";
import { useConfirmDialog } from "../../components/ConfirmDialogProvider";
import { useAdminSession } from "../../components/AdminSessionProvider";
import { AdminLoginScreen, LoadingScreen, MissingConfigScreen, NoAccessScreen } from "../../components/AdminScreens";
import { AdminShell } from "../../components/AdminShell";
import { EmptyState, FieldBlock, InlineMeta, PageAlert, SectionCard, ToneBadge } from "../../components/admin-kit";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { NativeSelect } from "../../components/ui/native-select";
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
  const confirm = useConfirmDialog();

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
    const ok = await confirm({
      title: `Удалить файл "${title}"?`,
      description: "Файл удалится из GitHub-хранилища и из Firestore.",
      confirmLabel: "Удалить",
      variant: "destructive",
    });
    if (!ok) return;

    if (!isGithubMediaConfigReady(githubConfig)) {
      toast.error("GitHub хранилище не настроено. Сначала сохраните настройки GitHub.");
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
      toast.error(error instanceof Error ? error.message : String(error));
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
    const ok = await confirm({
      title: "Очистить настройки GitHub?",
      description: "Локальные настройки на этом устройстве будут удалены.",
      confirmLabel: "Очистить",
      variant: "destructive",
    });
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
    <div className="grid gap-6">
      <Card className="border-border/70 bg-background/60">
        <CardHeader className="gap-1">
          <CardTitle className="text-lg">GitHub-хранилище</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 pt-0">
          <div className="grid gap-4 md:grid-cols-2">
            <FieldBlock label="Owner">
              <Input
                placeholder="my-username"
                value={githubConfig.owner}
                onChange={(e) => setGithubConfig((prev) => ({ ...prev, owner: e.target.value }))}
                disabled={savingGithub || testingGithub}
              />
            </FieldBlock>
            <FieldBlock label="Repo">
              <Input
                placeholder="kanokna-media"
                value={githubConfig.repo}
                onChange={(e) => setGithubConfig((prev) => ({ ...prev, repo: e.target.value }))}
                disabled={savingGithub || testingGithub}
              />
            </FieldBlock>
            <FieldBlock label="Branch">
              <Input
                placeholder="main"
                value={githubConfig.branch}
                onChange={(e) => setGithubConfig((prev) => ({ ...prev, branch: e.target.value }))}
                disabled={savingGithub || testingGithub}
              />
            </FieldBlock>
            <FieldBlock label="URL mode">
              <NativeSelect
                value={githubConfig.urlMode}
                onChange={(e) => setGithubConfig((prev) => ({ ...prev, urlMode: e.target.value as any }))}
                disabled={savingGithub || testingGithub}
              >
                <option value="raw">raw.githubusercontent.com</option>
                <option value="jsdelivr">jsDelivr (CDN)</option>
              </NativeSelect>
            </FieldBlock>
          </div>

          <FieldBlock label="Token" description="Fine-grained PAT с Contents: Read and write.">
            <Input
              type="password"
              placeholder="GitHub token"
              value={githubConfig.token}
              onChange={(e) => setGithubConfig((prev) => ({ ...prev, token: e.target.value }))}
              disabled={savingGithub || testingGithub}
            />
          </FieldBlock>

          <FieldBlock
            label="Базовая папка"
            description="Обычно оставьте пустым. Тогда файлы будут сохраняться в `/media/...`."
          >
            <Input
              placeholder='Например: "assets"'
              value={githubConfig.basePath}
              onChange={(e) => setGithubConfig((prev) => ({ ...prev, basePath: e.target.value }))}
              disabled={savingGithub || testingGithub}
            />
          </FieldBlock>

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => void testGithub()} disabled={testingGithub || savingGithub}>
              Проверить
            </Button>
            <Button type="button" variant="outline" onClick={() => void saveGithub()} disabled={savingGithub}>
              Сохранить
            </Button>
            <Button type="button" variant="destructive" onClick={() => void clearGithub()} disabled={savingGithub || testingGithub}>
              Очистить
            </Button>
          </div>

          {githubNotice ? <PageAlert title="Статус GitHub" description={githubNotice} variant="default" /> : null}
          {githubError ? <PageAlert title="Ошибка GitHub" description={githubError} /> : null}
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-background/60">
        <CardHeader className="gap-1">
          <CardTitle className="text-lg">Загрузка изображений</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 pt-0">
          <div className="grid gap-4 md:grid-cols-2">
            <FieldBlock label="Папка назначения">
              <NativeSelect value={uploadFolder} onChange={(e) => setUploadFolder(e.target.value as MediaFolder)} disabled={uploading}>
                {FOLDERS.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </NativeSelect>
            </FieldBlock>
            <FieldBlock label="Выбор файлов" description="Можно выбрать сразу несколько изображений.">
              <Input
                ref={pickerRef}
                type="file"
                accept="image/*"
                multiple
                disabled={!canUpload || uploading}
                onChange={(e) => onPick(e.currentTarget.files)}
              />
            </FieldBlock>
          </div>

          <InlineMeta
            items={[
              githubReady ? `${githubConfig.owner}/${githubConfig.repo} (${githubConfig.branch})` : "GitHub не настроен",
              fullPathPreview,
              canUpload ? "Загрузка доступна" : "Сначала сохраните GitHub-конфиг",
            ]}
          />

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
            className="rounded-2xl border border-dashed px-6 py-10 text-center transition-colors"
            style={{
              borderColor: dragOver ? "rgba(249, 115, 22, 0.55)" : "rgba(148, 163, 184, 0.35)",
              background: dragOver ? "rgba(249, 115, 22, 0.08)" : "rgba(255, 255, 255, 0.04)",
            }}
          >
            <div className="grid gap-2">
              <div className="text-base font-medium">Перетащите фото сюда</div>
              <div className="text-sm text-muted-foreground">Только изображения (`image/*`).</div>
            </div>
          </div>

          {uploadInfo ? (
            <ToneBadge tone="secondary">
              Загрузка {uploadInfo.index}/{uploadInfo.total} · {Math.round(uploadInfo.pct)}%
            </ToneBadge>
          ) : null}

          {uploadError ? <PageAlert title="Ошибка загрузки" description={uploadError} /> : null}
        </CardContent>
      </Card>
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
        <Button variant="secondary" onClick={() => pickerRef.current?.click()} disabled={!canUpload || uploading}>
          Загрузить
        </Button>
      }
    >
      {loadError ? <PageAlert title="Ошибка загрузки данных" description={loadError} /> : null}

      <SectionCard
        eyebrow="Только для админов"
        title="Загрузка файлов"
        description="Ссылки из этой секции можно использовать в товарах, галерее, акциях и настройках сайта."
        icon={Upload}
        tone="violet"
        actions={
          <>
            <ToneBadge tone={githubReady ? "success" : "muted"}>{githubReady ? "GitHub готов" : "GitHub не настроен"}</ToneBadge>
            <Badge variant="outline">Доступ: admin</Badge>
          </>
        }
      >
        {uploadPanel}
      </SectionCard>

      <SectionCard
        eyebrow="Firestore + GitHub"
        title="Файлы"
        description="Каталог загруженных изображений. Удаление убирает файл и из GitHub-хранилища, и из Firestore."
        icon={ImageIcon}
        tone="violet"
        actions={
          <>
            <Badge variant="outline">{items.length} шт.</Badge>
            {hasMore ? (
              <Button variant="outline" onClick={() => void loadMedia({ mode: "more" })} disabled={loadingData}>
                Ещё
              </Button>
            ) : null}
          </>
        }
      >
        {items.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => {
              const url = typeof item.url === "string" ? item.url : "";
              const path = typeof item.path === "string" ? item.path : "";
              const folderKey = typeof item.folder === "string" ? item.folder : "";
              const folder = folderKey ? folderLabel(folderKey) : "-";
              const name = typeof item.name === "string" ? item.name : item.id;

              return (
                <Card key={item.id} className="border-border/70 bg-background/70">
                  <CardHeader className="gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="grid gap-1">
                        <CardTitle className="break-all text-base">{name}</CardTitle>
                        <div className="break-all text-xs text-muted-foreground">{path || item.id}</div>
                      </div>
                      <ToneBadge tone="outline">{folder}</ToneBadge>
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-4 pt-0">
                    <div
                      className="overflow-hidden rounded-2xl border border-border/70 bg-muted/30"
                      style={{ aspectRatio: "16 / 10" }}
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

                    <div className="grid gap-3 sm:grid-cols-2">
                      <FieldBlock label="Размер">
                        <div className="text-sm text-muted-foreground">{formatBytes(item.size)}</div>
                      </FieldBlock>
                      <FieldBlock label="Тип">
                        <div className="text-sm text-muted-foreground">{item.contentType || "-"}</div>
                      </FieldBlock>
                      <FieldBlock label="Дата">
                        <div className="text-sm text-muted-foreground">{formatCreatedAt(item.createdAt)}</div>
                      </FieldBlock>
                      <FieldBlock label="URL" className="sm:col-span-2">
                        <div className="break-all text-sm text-muted-foreground">{url || "-"}</div>
                      </FieldBlock>
                    </div>

                    <div className="flex flex-wrap justify-end gap-2">
                      {url ? (
                        <Fragment>
                          <Button type="button" variant="outline" onClick={() => void copyText(url)}>
                            Копировать URL
                          </Button>
                          <Button type="button" variant="outline" onClick={() => window.open(url, "_blank")}>
                            Открыть
                          </Button>
                        </Fragment>
                      ) : null}
                      <Button type="button" variant="destructive" onClick={() => void onDelete(item)}>
                        Удалить
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : loadingData ? (
          <EmptyState title="Загрузка..." description="Получаем список файлов из Firestore." />
        ) : (
          <EmptyState title="Пока нет файлов" description="Загрузите первое изображение через форму выше." />
        )}
      </SectionCard>
    </AdminShell>
  );
}
