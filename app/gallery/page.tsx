"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
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
import { auth, db } from "../../lib/firebase";
import { AdminLoginScreen, LoadingScreen, MissingConfigScreen, NoAccessScreen } from "../../components/AdminScreens";
import { useAdminSession } from "../../components/AdminSessionProvider";
import { AdminShell } from "../../components/AdminShell";
import { EyeIcon, EyeOffIcon, PencilIcon, TrashIcon } from "../../components/Icons";
import { ImageUrlList } from "../../components/forms/ImageUrlList";

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
  const router = useRouter();

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
    const ok = confirm(`Удалить кейс "${item.title}"? Это действие необратимо.`);
    if (!ok) return;
    await deleteDoc(doc(db, "gallery", item.id));
    await loadGallery();
  };

  const onDraftImagesChange = useCallback(
    (next: string[]) => setGalleryDraft((prev) => ({ ...prev, images: next })),
    []
  );

  const galleryEditor = (
    <div className="editPanel">
      <div className="editGrid">
        <div className="grid" style={{ gap: 10 }}>
          <input
            placeholder="Название"
            value={galleryDraft.title}
            onChange={(e) => setGalleryDraft((prev) => ({ ...prev, title: e.target.value }))}
          />
          <div className="grid cols-2" style={{ gap: 10 }}>
            <input
              placeholder="Город"
              value={galleryDraft.city}
              onChange={(e) => setGalleryDraft((prev) => ({ ...prev, city: e.target.value }))}
            />
            <input
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
          <label className="row" style={{ gap: 10, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={galleryDraft.active}
              onChange={(e) => setGalleryDraft((prev) => ({ ...prev, active: e.target.checked }))}
            />
            <span>Показывать в приложении</span>
          </label>
        </div>
      </div>

      {galleryDraftError ? <div className="errorBox">{galleryDraftError}</div> : null}

      <div className="rowActions" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="secondary" onClick={cancelEditGallery} disabled={gallerySaving}>
          Отмена
        </button>
        <button type="button" onClick={() => void onSaveGallery()} disabled={gallerySaving}>
          {gallerySaving ? "Сохранение..." : "Сохранить"}
        </button>
      </div>
    </div>
  );

  if (session.status === "loading") return <LoadingScreen />;
  if (session.status === "missing_config") return <MissingConfigScreen />;
  if (session.status === "signed_out") return <AdminLoginScreen title="Портфолио" subtitle="Войдите под админским аккаунтом" />;
  if (session.status === "not_admin" || session.status === "role_check_failed") return <NoAccessScreen />;

  return (
    <AdminShell
      title="Портфолио"
      subtitle={session.user?.email ?? ""}
      rightActions={
        <>
          <button className="secondary" onClick={() => router.push("/gallery/new")}>
            Добавить
          </button>
          <button className="secondary" onClick={() => void loadGallery()} disabled={loadingData}>
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
            <h2>Список</h2>
            <small>{gallery.length} шт.</small>
          </div>
          <small>Добавление: кнопка + внизу справа.</small>
        </div>

        <div className="mobileOnly" style={{ marginTop: 12 }}>
          {gallery.length ? (
            <div className="cardList">
              {gallery.map((item) => {
                const visible = isVisible(item.active);
                const isEditing = editingGalleryId === item.id;

                return (
                  <div key={item.id} className="itemCard">
                    <div className="itemHeader">
                      <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
                        <b>{item.title}</b>
                        <small className="breakLong">{item.id}</small>
                      </div>
                      {visible ? <span className="badge">Показано</span> : <span className="badge badge-muted">Скрыто</span>}
                    </div>

                    <div className="kv">
                      <div className="kvRow">
                        <div className="kvLabel">Тип</div>
                        <div className="kvValue">{item.projectType ?? "-"}</div>
                      </div>
                      <div className="kvRow">
                        <div className="kvLabel">Город</div>
                        <div className="kvValue">{item.city ?? "-"}</div>
                      </div>
                    </div>

                    <div className="rowActions" style={{ justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        className="iconBtn iconBtn-secondary"
                        aria-label="Изменить"
                        title="Изменить"
                        onClick={() => startEditGallery(item)}
                      >
                        <PencilIcon />
                      </button>
                      <button
                        type="button"
                        className="iconBtn iconBtn-secondary"
                        aria-label={visible ? "Скрыть" : "Показать"}
                        title={visible ? "Скрыть" : "Показать"}
                        onClick={() => void onToggleGalleryVisibility(item)}
                      >
                        {visible ? <EyeOffIcon /> : <EyeIcon />}
                      </button>
                      <button
                        type="button"
                        className="iconBtn iconBtn-danger"
                        aria-label="Удалить"
                        title="Удалить"
                        onClick={() => void onDeleteGallery(item)}
                      >
                        <TrashIcon />
                      </button>
                    </div>

                    {isEditing ? galleryEditor : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <small>Пока нет кейсов.</small>
          )}
        </div>

        <div className="desktopOnly" style={{ marginTop: 12 }}>
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Название</th>
                  <th>Тип</th>
                  <th>Статус</th>
                  <th className="actionsCol">Действия</th>
                </tr>
              </thead>
              <tbody>
                {gallery.map((item) => {
                  const visible = isVisible(item.active);
                  const isEditing = editingGalleryId === item.id;

                  return (
                    <Fragment key={item.id}>
                      <tr>
                        <td>
                          <div style={{ display: "grid", gap: 4 }}>
                            <b>{item.title}</b>
                            <small className="breakLong">{item.id}</small>
                          </div>
                        </td>
                        <td>{item.projectType ?? "-"}</td>
                        <td>{visible ? <span className="badge">Показано</span> : <span className="badge badge-muted">Скрыто</span>}</td>
                        <td>
                          <div className="rowActions">
                            <button
                              type="button"
                              className="iconBtn iconBtn-secondary"
                              aria-label="Изменить"
                              title="Изменить"
                              onClick={() => startEditGallery(item)}
                            >
                              <PencilIcon />
                            </button>
                            <button
                              type="button"
                              className="iconBtn iconBtn-secondary"
                              aria-label={visible ? "Скрыть" : "Показать"}
                              title={visible ? "Скрыть" : "Показать"}
                              onClick={() => void onToggleGalleryVisibility(item)}
                            >
                              {visible ? <EyeOffIcon /> : <EyeIcon />}
                            </button>
                            <button
                              type="button"
                              className="iconBtn iconBtn-danger"
                              aria-label="Удалить"
                              title="Удалить"
                              onClick={() => void onDeleteGallery(item)}
                            >
                              <TrashIcon />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {isEditing ? (
                        <tr>
                          <td colSpan={4}>{galleryEditor}</td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </AdminShell>
  );
}
