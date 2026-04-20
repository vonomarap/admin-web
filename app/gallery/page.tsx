"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { ImageIcon } from "lucide-react";
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useConfirmDialog } from "../../components/ConfirmDialogProvider";
import { AdminLoginScreen, LoadingScreen, MissingConfigScreen, NoAccessScreen } from "../../components/AdminScreens";
import { useAdminSession } from "../../components/AdminSessionProvider";
import { AdminShell } from "../../components/AdminShell";
import { ActionIconButton, EmptyState, PageAlert, SectionCard, SwitchField, ToneBadge } from "../../components/admin-kit";
import { EyeIcon, EyeOffIcon, PencilIcon, TrashIcon } from "../../components/Icons";
import { ImageUrlList } from "../../components/forms/ImageUrlList";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";

type GalleryItem = {
  id: string;
  title: string;
  city?: string;
  projectType?: string;
  images?: string[];
  imageUrl?: string;
  active?: boolean;
};

function isVisible(active?: boolean): boolean {
  return active !== false;
}

function normalizeImageUrls(urls: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of urls) {
    const url = typeof raw === "string" ? raw.trim() : "";
    if (!url) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

export default function GalleryPage(): JSX.Element {
  const session = useAdminSession();
  const confirm = useConfirmDialog();

  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);

  const [editingGalleryId, setEditingGalleryId] = useState<string | null>(null);
  const [galleryDraftError, setGalleryDraftError] = useState<string | null>(null);
  const [gallerySaving, setGallerySaving] = useState(false);
  const [galleryDraft, setGalleryDraft] = useState({
    title: "",
    city: "",
    projectType: "",
    images: [] as string[],
    active: true,
  });

  const loadGallery = useCallback(async () => {
    if (!db) return;
    setLoadError(null);
    setLoadingData(true);
    try {
      const snap = await getDocs(query(collection(db, "gallery"), orderBy("title", "asc")));
      setGallery(snap.docs.map((docRef) => ({ id: docRef.id, ...(docRef.data() as Omit<GalleryItem, "id">) })));
    } catch (error) {
      console.error("Admin loadGallery failed:", error);
      setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (session.status !== "ready") return;
    void loadGallery();
  }, [loadGallery, session.status]);

  useEffect(() => {
    if (session.status !== "ready") return;

    const win = window as unknown as { addEventListener?: any; removeEventListener?: any };
    const docRef = document as unknown as { addEventListener?: any; removeEventListener?: any; visibilityState?: string };

    const refresh = () => {
      if (loadingData) return;
      void loadGallery();
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
  }, [loadGallery, loadingData, session.status]);

  const startEditGallery = (item: GalleryItem) => {
    setGalleryDraftError(null);
    setEditingGalleryId(item.id);

    const images = Array.isArray(item.images)
      ? item.images.filter((url): url is string => typeof url === "string" && url.trim().length > 0)
      : [];
    const fallback = typeof item.imageUrl === "string" && item.imageUrl.trim() ? [item.imageUrl] : [];
    const initialImages = images.length ? images : fallback;

    setGalleryDraft({
      title: item.title ?? "",
      city: item.city ?? "",
      projectType: item.projectType ?? "",
      images: initialImages,
      active: isVisible(item.active),
    });
  };

  const cancelEditGallery = () => {
    setEditingGalleryId(null);
    setGalleryDraftError(null);
  };

  const onSaveGallery = async () => {
    if (!db || !editingGalleryId) return;

    const title = galleryDraft.title.trim();
    if (!title) {
      setGalleryDraftError("Название кейса обязательно.");
      return;
    }

    setGallerySaving(true);
    setGalleryDraftError(null);
    try {
      const normalizedImages = normalizeImageUrls(galleryDraft.images);

      await updateDoc(doc(db, "gallery", editingGalleryId), {
        title,
        city: galleryDraft.city.trim(),
        projectType: galleryDraft.projectType.trim(),
        images: normalizedImages.length ? normalizedImages : deleteField(),
        imageUrl: normalizedImages[0] ? normalizedImages[0] : deleteField(),
        active: Boolean(galleryDraft.active),
        updatedAt: serverTimestamp(),
      });
      setEditingGalleryId(null);
      await loadGallery();
    } catch (error) {
      console.error("Gallery save failed:", error);
      setGalleryDraftError(error instanceof Error ? error.message : String(error));
    } finally {
      setGallerySaving(false);
    }
  };

  const onToggleGalleryVisibility = async (item: GalleryItem) => {
    if (!db) return;
    const nextActive = item.active === false ? true : false;
    await updateDoc(doc(db, "gallery", item.id), {
      active: nextActive,
      updatedAt: serverTimestamp(),
    });
    await loadGallery();
  };

  const onDeleteGallery = async (item: GalleryItem) => {
    if (!db) return;
    const ok = await confirm({
      title: `Удалить кейс "${item.title}"?`,
      description: "Это действие необратимо.",
      confirmLabel: "Удалить",
      variant: "destructive",
    });
    if (!ok) return;
    await deleteDoc(doc(db, "gallery", item.id));
    await loadGallery();
  };

  const onDraftImagesChange = useCallback(
    (next: string[]) => setGalleryDraft((prev) => ({ ...prev, images: next })),
    []
  );

  const galleryEditor = (
    <Card className="border-border/80 bg-background/60">
      <CardHeader className="gap-1">
        <CardTitle className="text-lg">Редактирование кейса</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6 pt-0">
        <div className="grid gap-4">
          <Input
            placeholder="Название"
            value={galleryDraft.title}
            onChange={(e) => setGalleryDraft((prev) => ({ ...prev, title: e.target.value }))}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <Input
              placeholder="Город"
              value={galleryDraft.city}
              onChange={(e) => setGalleryDraft((prev) => ({ ...prev, city: e.target.value }))}
            />
            <Input
              placeholder="Тип проекта (например: окно/дверь)"
              value={galleryDraft.projectType}
              onChange={(e) => setGalleryDraft((prev) => ({ ...prev, projectType: e.target.value }))}
            />
          </div>
          <ImageUrlList
            title="Фотографии"
            subtitle="Можно добавить несколько. Первое фото используется как обложка."
            value={galleryDraft.images}
            resetKey={editingGalleryId ?? "none"}
            onChange={onDraftImagesChange}
            disabled={gallerySaving}
            uploadFolder="gallery"
          />
          <SwitchField
            title="Показывать в приложении"
            checked={galleryDraft.active}
            onCheckedChange={(checked) => setGalleryDraft((prev) => ({ ...prev, active: checked }))}
          />
        </div>

        {galleryDraftError ? <PageAlert title="Не удалось сохранить кейс" description={galleryDraftError} /> : null}

        <div className="flex flex-wrap justify-end gap-3">
          <Button type="button" variant="outline" onClick={cancelEditGallery} disabled={gallerySaving}>
            Отмена
          </Button>
          <Button type="button" onClick={() => void onSaveGallery()} disabled={gallerySaving}>
            {gallerySaving ? "Сохранение..." : "Сохранить"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  if (session.status === "loading") return <LoadingScreen />;
  if (session.status === "missing_config") return <MissingConfigScreen />;
  if (session.status === "signed_out") return <AdminLoginScreen title="Портфолио" subtitle="Войдите под админским аккаунтом" />;
  if (session.status === "not_admin" || session.status === "role_check_failed") return <NoAccessScreen />;

  return (
    <AdminShell
      title="Портфолио"
      subtitle={session.user?.email ?? ""}
    >
      <div className="flex flex-col gap-6">
        {loadError ? <PageAlert title="Ошибка загрузки данных" description={loadError} /> : null}

        <SectionCard
          eyebrow="Портфолио"
          title="Кейсы"
          description="Управление публикацией выполненных работ и их визуальным наполнением."
          icon={ImageIcon}
          tone="violet"
          footer={
            <>
              <div className="text-sm text-muted-foreground">{gallery.length} шт.</div>
              <Badge variant="outline">Firestore → gallery</Badge>
            </>
          }
        >
          {!gallery.length ? (
            <EmptyState title="Пока нет кейсов" description="Добавьте первый кейс, чтобы наполнить портфолио." />
          ) : (
            <div className="grid gap-4">
              <div className="grid gap-3 lg:hidden">
                {gallery.map((item) => {
                  const visible = isVisible(item.active);
                  const isEditing = editingGalleryId === item.id;

                  return (
                    <Card key={item.id} className="border-border/80">
                      <CardHeader className="gap-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="grid min-w-0 gap-1">
                            <CardTitle className="text-base">{item.title}</CardTitle>
                            <div className="breakLong text-sm text-muted-foreground">{item.id}</div>
                          </div>
                          {visible ? <ToneBadge tone="default">Показано</ToneBadge> : <ToneBadge tone="muted">Скрыто</ToneBadge>}
                        </div>
                      </CardHeader>
                      <CardContent className="grid gap-4 pt-0">
                        <div className="grid gap-1 text-sm">
                          <div className="text-muted-foreground">Тип: {item.projectType ?? "-"}</div>
                          <div className="text-muted-foreground">Город: {item.city ?? "-"}</div>
                        </div>
                        <div className="flex flex-wrap justify-end gap-2">
                          <ActionIconButton aria-label="Изменить" title="Изменить" onClick={() => startEditGallery(item)}>
                            <PencilIcon />
                          </ActionIconButton>
                          <ActionIconButton
                            aria-label={visible ? "Скрыть" : "Показать"}
                            title={visible ? "Скрыть" : "Показать"}
                            onClick={() => void onToggleGalleryVisibility(item)}
                          >
                            {visible ? <EyeOffIcon /> : <EyeIcon />}
                          </ActionIconButton>
                          <ActionIconButton variant="destructive" aria-label="Удалить" title="Удалить" onClick={() => void onDeleteGallery(item)}>
                            <TrashIcon />
                          </ActionIconButton>
                        </div>
                        {isEditing ? galleryEditor : null}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              <div className="hidden lg:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Название</TableHead>
                      <TableHead>Тип</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead>Действия</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {gallery.map((item) => {
                      const visible = isVisible(item.active);
                      const isEditing = editingGalleryId === item.id;

                      return (
                        <Fragment key={item.id}>
                          <TableRow>
                            <TableCell>
                              <div className="grid gap-1">
                                <b>{item.title}</b>
                                <small className="breakLong">{item.id}</small>
                              </div>
                            </TableCell>
                            <TableCell>{item.projectType ?? "-"}</TableCell>
                            <TableCell>
                              {visible ? <ToneBadge tone="default">Показано</ToneBadge> : <ToneBadge tone="muted">Скрыто</ToneBadge>}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-2">
                                <ActionIconButton aria-label="Изменить" title="Изменить" onClick={() => startEditGallery(item)}>
                                  <PencilIcon />
                                </ActionIconButton>
                                <ActionIconButton
                                  aria-label={visible ? "Скрыть" : "Показать"}
                                  title={visible ? "Скрыть" : "Показать"}
                                  onClick={() => void onToggleGalleryVisibility(item)}
                                >
                                  {visible ? <EyeOffIcon /> : <EyeIcon />}
                                </ActionIconButton>
                                <ActionIconButton variant="destructive" aria-label="Удалить" title="Удалить" onClick={() => void onDeleteGallery(item)}>
                                  <TrashIcon />
                                </ActionIconButton>
                              </div>
                            </TableCell>
                          </TableRow>
                          {isEditing ? (
                            <TableRow>
                              <TableCell colSpan={4}>{galleryEditor}</TableCell>
                            </TableRow>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </SectionCard>
      </div>
    </AdminShell>
  );
}
