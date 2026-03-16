"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useAdminSession } from "../../../components/AdminSessionProvider";
import { AdminLoginScreen, LoadingScreen, MissingConfigScreen, NoAccessScreen } from "../../../components/AdminScreens";
import { AdminShell } from "../../../components/AdminShell";
import { MediaUploadButton } from "../../../components/forms/MediaUploadButton";
import { ImageThumbPreview } from "../../../components/forms/ImageThumbPreview";

function normalizeCurrency(value: string): string {
  const code = (value || "").trim().toUpperCase();
  return code || "RUB";
}

export default function NewProductPage(): JSX.Element {
  const session = useAdminSession();
  const router = useRouter();

  if (session.status === "loading") return <LoadingScreen />;
  if (session.status === "missing_config") return <MissingConfigScreen />;
  if (session.status === "signed_out") return <AdminLoginScreen title="Добавить товар" subtitle="Войдите под админским аккаунтом" />;
  if (session.status === "not_admin" || session.status === "role_check_failed") return <NoAccessScreen />;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priceFrom, setPriceFrom] = useState("120");
  const [image, setImage] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/products");
  };

  const canSave = useMemo(() => Boolean(title.trim()) && !saving, [saving, title]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!db) return;

    const nextTitle = title.trim();
    if (!nextTitle) return;

    const price = Number(priceFrom);
    if (!Number.isFinite(price) || price < 0) {
      setError("Цена должна быть числом (0 или больше).");
      return;
    }

    const sortOrder = Date.now() * 1000 + Math.floor(Math.random() * 1000);

    const payload: Record<string, unknown> = {
      title: nextTitle,
      priceFrom: price || 0,
      currency: "RUB",
      active: Boolean(active),
      sortOrder,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const desc = description.trim();
    if (desc) payload.description = desc;

    const img = image.trim();
    if (img) payload.image = img;

    setSaving(true);
    setError(null);
    try {
      await addDoc(collection(db, "products"), payload);
      router.push("/products");
    } catch (err) {
      console.error("Create product failed:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminShell
      title="Добавить товар"
      subtitle={session.user?.email ? `Доступно для ${session.user.email}` : "Доступно для админа"}
      rightActions={
        <button type="button" className="secondary" onClick={goBack} disabled={saving}>
          Назад
        </button>
      }
    >
      <section className="card" style={{ display: "grid", gap: 12 }}>
        <h2>Данные товара</h2>
        <form onSubmit={onSubmit} className="grid" style={{ gap: 10 }}>
          <input placeholder="Название" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <textarea
            rows={3}
            placeholder="Описание (опционально)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="grid cols-2" style={{ gap: 10 }}>
            <input placeholder="Цена от" value={priceFrom} onChange={(e) => setPriceFrom(e.target.value)} inputMode="decimal" />
            <select value="RUB" disabled>
              <option value="RUB">RUB</option>
            </select>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            <div className="rowActions" style={{ alignItems: "stretch" }}>
              <input
                placeholder="Ссылка на изображение (опционально)"
                value={image}
                onChange={(e) => setImage(e.target.value)}
                autoCapitalize="none"
                style={{ flex: 1, minWidth: 0 }}
              />
              <MediaUploadButton
                folder="products"
                label="Загрузить"
                disabled={saving}
                onUploaded={(urls) => setImage(urls[0] ?? "")}
              />
            </div>
            <ImageThumbPreview url={image} />
            <small>Можно загрузить фото в «Медиа» и вставить URL сюда.</small>
          </div>
          <label className="row" style={{ gap: 10, alignItems: "center" }}>
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            <span>Показывать в каталоге</span>
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
