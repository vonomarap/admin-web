"use client";

import { FormEvent, useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useAdminSession } from "../../../components/AdminSessionProvider";
import { AdminLoginScreen, LoadingScreen, MissingConfigScreen, NoAccessScreen } from "../../../components/AdminScreens";
import { AdminShell } from "../../../components/AdminShell";
import { ImageUrlList } from "../../../components/forms/ImageUrlList";

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

export default function NewGalleryPage(): JSX.Element {
  const session = useAdminSession();
  const router = useRouter();

  if (session.status === "loading") return <LoadingScreen />;
  if (session.status === "missing_config") return <MissingConfigScreen />;
  if (session.status === "signed_out") return <AdminLoginScreen title="Добавить кейс" subtitle="Войдите под админским аккаунтом" />;
  if (session.status === "not_admin" || session.status === "role_check_failed") return <NoAccessScreen />;

  const [title, setTitle] = useState("");
  const [city, setCity] = useState("");
  const [projectType, setProjectType] = useState("window");
  const [images, setImages] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/gallery");
  };

  const canSave = useMemo(() => Boolean(title.trim()) && !saving, [saving, title]);

  const onImagesChange = useCallback((next: string[]) => setImages(next), []);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!db) return;

    const nextTitle = title.trim();
    if (!nextTitle) return;

    const payload: Record<string, unknown> = {
      title: nextTitle,
      city: city.trim(),
      projectType: projectType.trim(),
      active: Boolean(active),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const normalizedImages = normalizeImageUrls(images);
    if (normalizedImages.length) {
      payload.images = normalizedImages;
      payload.imageUrl = normalizedImages[0];
    }

    setSaving(true);
    setError(null);
    try {
      await addDoc(collection(db, "gallery"), payload);
      router.push("/gallery");
    } catch (err) {
      console.error("Create gallery failed:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminShell
      title="Добавить кейс"
      subtitle={session.user?.email ? `Доступно для ${session.user.email}` : "Доступно для админа"}
      rightActions={
        <button type="button" className="secondary" onClick={goBack} disabled={saving}>
          Назад
        </button>
      }
    >
      <section className="card" style={{ display: "grid", gap: 12 }}>
        <h2>Данные кейса</h2>
        <form onSubmit={onSubmit} className="grid" style={{ gap: 10 }}>
          <input placeholder="Название" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <div className="grid cols-2" style={{ gap: 10 }}>
            <input placeholder="Город" value={city} onChange={(e) => setCity(e.target.value)} />
            <input
              placeholder="Тип проекта (например: окно/дверь)"
              value={projectType}
              onChange={(e) => setProjectType(e.target.value)}
            />
          </div>
          <ImageUrlList
            title="Фотографии"
            subtitle="Добавьте одну или несколько ссылок на изображения, или загрузите файлы."
            value={images}
            resetKey="new"
            onChange={onImagesChange}
            disabled={saving}
            uploadFolder="gallery"
          />
          <label className="row" style={{ gap: 10, alignItems: "center" }}>
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            <span>Показывать в приложении</span>
          </label>

          {error ? <div className="errorBox">{error}</div> : null}

          <div className="rowActions" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="secondary" onClick={goBack} disabled={saving}>
              Отмена
            </button>
            <button type="submit" disabled={!canSave}>
              {saving ? "Сохранение..." : "Сохранить"}
            </button>
          </div>
        </form>
      </section>
    </AdminShell>
  );
}
