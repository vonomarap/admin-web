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
  writeBatch,
} from "firebase/firestore";
import { auth, db } from "../../lib/firebase";
import { AdminLoginScreen, LoadingScreen, MissingConfigScreen, NoAccessScreen } from "../../components/AdminScreens";
import { useAdminSession } from "../../components/AdminSessionProvider";
import { AdminShell } from "../../components/AdminShell";
import { ChevronDownIcon, ChevronUpIcon, EyeIcon, EyeOffIcon, PencilIcon, TrashIcon } from "../../components/Icons";
import { MediaUploadButton } from "../../components/forms/MediaUploadButton";
import { ImageThumbPreview } from "../../components/forms/ImageThumbPreview";

type Product = {
  id: string;
  title: string;
  description?: string;
  priceFrom?: number;
  currency?: string;
  image?: string;
  features?: string[];
  specs?: Record<string, string | number>;
  sortOrder?: number;
  active?: boolean;
};

function isVisible(active?: boolean): boolean {
  return active !== false;
}

function normalizeCurrency(value: string): string {
  const code = (value || "").trim().toUpperCase();
  return code || "RUB";
}

function formatCurrency(amount: number, currency?: string): string {
  const code = (currency || "").trim().toUpperCase() || "RUB";
  const safe = Number.isFinite(amount) ? amount : 0;
  const formatted = safe.toLocaleString(code === "RUB" ? "ru-RU" : "en-US", { maximumFractionDigits: 0 });
  if (code === "RUB") return `${formatted} ₽`;
  if (code === "USD") return `$${formatted}`;
  return `${formatted} ${code}`;
}

export default function ProductsPage(): JSX.Element {
  const session = useAdminSession();
  const router = useRouter();

  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);

  const [orderBusy, setOrderBusy] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);

  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [productDraftError, setProductDraftError] = useState<string | null>(null);
  const [productSaving, setProductSaving] = useState(false);
  const [productDraft, setProductDraft] = useState({
    title: "",
    description: "",
    priceFrom: "",
    currency: "RUB",
    image: "",
    active: true,
    features: "",
    specs: "",
  });

  const loadProducts = useCallback(async () => {
    if (!db) return;
    setLoadError(null);
    setLoadingData(true);
    try {
      const snap = await getDocs(query(collection(db, "products"), orderBy("title", "asc")));
      setProducts(snap.docs.map((docRef) => ({ id: docRef.id, ...(docRef.data() as Omit<Product, "id">) })));
    } catch (error) {
      console.error("Admin loadProducts failed:", error);
      setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingData(false);
    }
  }, []);

  const hasMissingSortOrder = useMemo(() => {
    return products.some((item) => typeof item.sortOrder !== "number" || !Number.isFinite(item.sortOrder));
  }, [products]);

  const productsOrdered = useMemo(() => {
    const locale = typeof navigator !== "undefined" ? navigator.language : undefined;
    const compareTitle = (a: Pick<Product, "title">, b: Pick<Product, "title">) =>
      String(a.title || "").localeCompare(String(b.title || ""), locale, { sensitivity: "base" });

    const getOrder = (item: Product) =>
      typeof item.sortOrder === "number" && Number.isFinite(item.sortOrder) ? item.sortOrder : Number.MAX_SAFE_INTEGER;

    return [...products].sort((a, b) => {
      const ao = getOrder(a);
      const bo = getOrder(b);
      if (ao !== bo) return ao - bo;
      return compareTitle(a, b);
    });
  }, [products]);

  const onInitializeSortOrder = async () => {
    if (!db) return;
    const firestore = db;
    const ok = confirm("Задать порядок каталога по названию (A–Z)? Это перезапишет текущий порядок.");
    if (!ok) return;

    setOrderBusy(true);
    setOrderError(null);
    try {
      const locale = typeof navigator !== "undefined" ? navigator.language : undefined;
      const compareTitle = (a: Pick<Product, "title">, b: Pick<Product, "title">) =>
        String(a.title || "").localeCompare(String(b.title || ""), locale, { sensitivity: "base" });

      const base = [...products].sort(compareTitle);
      const chunkSize = 450;

      for (let i = 0; i < base.length; i += chunkSize) {
        const batch = writeBatch(firestore);
        const slice = base.slice(i, i + chunkSize);
        slice.forEach((item, idx) => {
          batch.update(doc(firestore, "products", item.id), {
            sortOrder: (i + idx) * 1000,
            updatedAt: serverTimestamp(),
          });
        });
        await batch.commit();
      }

      await loadProducts();
    } catch (error) {
      console.error("Initialize sortOrder failed:", error);
      setOrderError(error instanceof Error ? error.message : String(error));
    } finally {
      setOrderBusy(false);
    }
  };

  const swapProducts = async (indexA: number, indexB: number) => {
    if (!db) return;
    const firestore = db;
    const a = productsOrdered[indexA];
    const b = productsOrdered[indexB];
    if (!a || !b) return;
    if (typeof a.sortOrder !== "number" || !Number.isFinite(a.sortOrder)) return;
    if (typeof b.sortOrder !== "number" || !Number.isFinite(b.sortOrder)) return;

    setOrderBusy(true);
    setOrderError(null);
    try {
      const batch = writeBatch(firestore);
      batch.update(doc(firestore, "products", a.id), { sortOrder: b.sortOrder, updatedAt: serverTimestamp() });
      batch.update(doc(firestore, "products", b.id), { sortOrder: a.sortOrder, updatedAt: serverTimestamp() });
      await batch.commit();
      await loadProducts();
    } catch (error) {
      console.error("Swap sortOrder failed:", error);
      setOrderError(error instanceof Error ? error.message : String(error));
    } finally {
      setOrderBusy(false);
    }
  };

  useEffect(() => {
    if (session.status !== "ready") return;
    void loadProducts();
  }, [loadProducts, session.status]);

  useEffect(() => {
    if (session.status !== "ready") return;

    const win = window as unknown as { addEventListener?: any; removeEventListener?: any };
    const docRef = document as unknown as { addEventListener?: any; removeEventListener?: any; visibilityState?: string };

    const refresh = () => {
      if (loadingData) return;
      void loadProducts();
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
  }, [loadProducts, loadingData, session.status]);

  const startEditProduct = (item: Product) => {
    setProductDraftError(null);
    setEditingProductId(item.id);
    setProductDraft({
      title: item.title ?? "",
      description: item.description ?? "",
      priceFrom: String(item.priceFrom ?? 0),
      currency: "RUB",
      image: item.image ?? "",
      active: isVisible(item.active),
      features: (item.features ?? []).join("\n"),
      specs: item.specs ? JSON.stringify(item.specs, null, 2) : "",
    });
  };

  const cancelEditProduct = () => {
    setEditingProductId(null);
    setProductDraftError(null);
  };

  const parseFeatures = (raw: string): string[] => {
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 50);
  };

  const parseSpecs = (raw: string): Record<string, string | number> | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("Характеристики должны быть JSON-объектом (например: {\"Профиль\":\"KBE\"})");
    }
    return parsed as Record<string, string | number>;
  };

  const onSaveProduct = async () => {
    if (!db || !editingProductId) return;

    const title = productDraft.title.trim();
    if (!title) {
      setProductDraftError("Название товара обязательно.");
      return;
    }

    const price = Number(productDraft.priceFrom);
    if (!Number.isFinite(price) || price < 0) {
      setProductDraftError("Цена должна быть числом (0 или больше).");
      return;
    }

    let specs: Record<string, string | number> | null = null;
    try {
      specs = parseSpecs(productDraft.specs);
    } catch (error) {
      setProductDraftError(error instanceof Error ? error.message : "Неверный JSON в характеристиках.");
      return;
    }

    const features = parseFeatures(productDraft.features);

    setProductSaving(true);
    setProductDraftError(null);
    try {
      await updateDoc(doc(db, "products", editingProductId), {
        title,
        description: productDraft.description.trim(),
        priceFrom: price || 0,
        currency: "RUB",
        image: productDraft.image.trim() || deleteField(),
        active: Boolean(productDraft.active),
        features: features.length ? features : deleteField(),
        specs: specs ? specs : deleteField(),
        updatedAt: serverTimestamp(),
      });
      setEditingProductId(null);
      await loadProducts();
    } catch (error) {
      console.error("Product save failed:", error);
      setProductDraftError(error instanceof Error ? error.message : String(error));
    } finally {
      setProductSaving(false);
    }
  };

  const onToggleProductVisibility = async (item: Product) => {
    if (!db) return;
    const nextActive = item.active === false ? true : false;
    await updateDoc(doc(db, "products", item.id), {
      active: nextActive,
      updatedAt: serverTimestamp(),
    });
    await loadProducts();
  };

  const onDeleteProduct = async (item: Product) => {
    if (!db) return;
    const ok = confirm(`Удалить товар "${item.title}"? Это действие необратимо.`);
    if (!ok) return;
    await deleteDoc(doc(db, "products", item.id));
    await loadProducts();
  };

  const productEditor = (
    <div className="editPanel">
      <div className="editGrid">
        <div className="grid" style={{ gap: 10 }}>
          <input
            placeholder="Название"
            value={productDraft.title}
            onChange={(e) => setProductDraft((prev) => ({ ...prev, title: e.target.value }))}
          />
          <textarea
            rows={3}
            placeholder="Описание"
            value={productDraft.description}
            onChange={(e) => setProductDraft((prev) => ({ ...prev, description: e.target.value }))}
          />
          <div className="grid cols-2" style={{ gap: 10 }}>
            <input
              placeholder="Цена от"
              value={productDraft.priceFrom}
              onChange={(e) => setProductDraft((prev) => ({ ...prev, priceFrom: e.target.value }))}
            />
            <select value="RUB" disabled>
              <option value="RUB">RUB</option>
            </select>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            <div className="rowActions" style={{ alignItems: "stretch" }}>
              <input
                placeholder="Ссылка на изображение"
                value={productDraft.image}
                onChange={(e) => setProductDraft((prev) => ({ ...prev, image: e.target.value }))}
                autoCapitalize="none"
                style={{ flex: 1, minWidth: 0 }}
              />
              <MediaUploadButton
                folder="products"
                label="Загрузить"
                disabled={productSaving}
                onUploaded={(urls) => setProductDraft((prev) => ({ ...prev, image: urls[0] ?? "" }))}
              />
            </div>
            <ImageThumbPreview url={productDraft.image} />
            <small>Можно загрузить фото в «Медиа» и вставить URL сюда.</small>
          </div>
          <label className="row" style={{ gap: 10, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={productDraft.active}
              onChange={(e) => setProductDraft((prev) => ({ ...prev, active: e.target.checked }))}
            />
            <span>Показывать в каталоге</span>
          </label>
        </div>

        <div className="grid" style={{ gap: 10 }}>
          <textarea
            rows={7}
            placeholder="Особенности (по одной на строку)"
            value={productDraft.features}
            onChange={(e) => setProductDraft((prev) => ({ ...prev, features: e.target.value }))}
          />
          <textarea
            rows={7}
            className="codeArea"
            placeholder='Характеристики (JSON, например: {"Профиль":"KBE"})'
            value={productDraft.specs}
            onChange={(e) => setProductDraft((prev) => ({ ...prev, specs: e.target.value }))}
            spellCheck={false}
          />
        </div>
      </div>

      {productDraftError ? <div className="errorBox">{productDraftError}</div> : null}

      <div className="rowActions" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="secondary" onClick={cancelEditProduct} disabled={productSaving}>
          Отмена
        </button>
        <button type="button" onClick={() => void onSaveProduct()} disabled={productSaving}>
          {productSaving ? "Сохранение..." : "Сохранить"}
        </button>
      </div>
    </div>
  );

  if (session.status === "loading") return <LoadingScreen />;
  if (session.status === "missing_config") return <MissingConfigScreen />;
  if (session.status === "signed_out") return <AdminLoginScreen title="Товары" subtitle="Войдите под админским аккаунтом" />;
  if (session.status === "not_admin" || session.status === "role_check_failed") return <NoAccessScreen />;

  return (
    <AdminShell
      title="Товары"
      subtitle={session.user?.email ?? ""}
      rightActions={
        <>
          <button className="secondary" onClick={() => router.push("/products/new")}>
            Добавить
          </button>
          <button className="secondary" onClick={() => void loadProducts()} disabled={loadingData}>
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

      {orderError ? (
        <section className="card noticeCard noticeCard-error">
          <h3 style={{ marginBottom: 6 }}>Ошибка изменения порядка</h3>
          <small className="noticeText-danger">{orderError}</small>
        </section>
      ) : null}

      {hasMissingSortOrder ? (
        <section className="card noticeCard noticeCard-warning">
          <div className="rowActions" style={{ justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div style={{ display: "grid", gap: 4 }}>
              <b>Порядок каталога не задан</b>
              <small className="noticeText-warning">Нажмите «Инициализировать», чтобы включить сортировку и кнопки ↑/↓.</small>
            </div>
            <button type="button" className="secondary" onClick={() => void onInitializeSortOrder()} disabled={orderBusy || loadingData}>
              {orderBusy ? "Инициализация..." : "Инициализировать"}
            </button>
          </div>
        </section>
      ) : null}

      <section className="card">
        <div className="rowActions" style={{ justifyContent: "space-between" }}>
          <div style={{ display: "grid", gap: 2 }}>
            <h2>Список</h2>
            <small>{products.length} шт.</small>
          </div>
          <small>Порядок: используйте ↑/↓.</small>
        </div>

        <div className="mobileOnly" style={{ marginTop: 12 }}>
          {products.length ? (
            <div className="cardList">
              {productsOrdered.map((item, index) => {
                const visible = isVisible(item.active);
                const isEditing = editingProductId === item.id;
                const canMoveUp = !orderBusy && !hasMissingSortOrder && index > 0;
                const canMoveDown = !orderBusy && !hasMissingSortOrder && index < productsOrdered.length - 1;

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
                        <div className="kvLabel">Цена</div>
                        <div className="kvValue">{formatCurrency(item.priceFrom ?? 0, item.currency)}</div>
                      </div>
                    </div>

                    <div className="rowActions" style={{ justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        className="iconBtn iconBtn-secondary"
                        aria-label="Выше"
                        title="Выше"
                        onClick={() => void swapProducts(index, index - 1)}
                        disabled={!canMoveUp}
                      >
                        <ChevronUpIcon />
                      </button>
                      <button
                        type="button"
                        className="iconBtn iconBtn-secondary"
                        aria-label="Ниже"
                        title="Ниже"
                        onClick={() => void swapProducts(index, index + 1)}
                        disabled={!canMoveDown}
                      >
                        <ChevronDownIcon />
                      </button>
                      <button
                        type="button"
                        className="iconBtn iconBtn-secondary"
                        aria-label="Изменить"
                        title="Изменить"
                        onClick={() => startEditProduct(item)}
                      >
                        <PencilIcon />
                      </button>
                      <button
                        type="button"
                        className="iconBtn iconBtn-secondary"
                        aria-label={visible ? "Скрыть" : "Показать"}
                        title={visible ? "Скрыть" : "Показать"}
                        onClick={() => void onToggleProductVisibility(item)}
                      >
                        {visible ? <EyeOffIcon /> : <EyeIcon />}
                      </button>
                      <button
                        type="button"
                        className="iconBtn iconBtn-danger"
                        aria-label="Удалить"
                        title="Удалить"
                        onClick={() => void onDeleteProduct(item)}
                      >
                        <TrashIcon />
                      </button>
                    </div>

                    {isEditing ? productEditor : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <small>Пока нет товаров.</small>
          )}
        </div>

        <div className="desktopOnly" style={{ marginTop: 12 }}>
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Название</th>
                  <th>Цена</th>
                  <th>Статус</th>
                  <th className="actionsCol">Действия</th>
                </tr>
              </thead>
              <tbody>
                {productsOrdered.map((item, index) => {
                  const visible = isVisible(item.active);
                  const isEditing = editingProductId === item.id;
                  const canMoveUp = !orderBusy && !hasMissingSortOrder && index > 0;
                  const canMoveDown = !orderBusy && !hasMissingSortOrder && index < productsOrdered.length - 1;

                  return (
                    <Fragment key={item.id}>
                      <tr>
                        <td>
                          <div style={{ display: "grid", gap: 4 }}>
                            <b>{item.title}</b>
                            <small className="breakLong">{item.id}</small>
                          </div>
                        </td>
                        <td>{formatCurrency(item.priceFrom ?? 0, item.currency)}</td>
                        <td>{visible ? <span className="badge">Показано</span> : <span className="badge badge-muted">Скрыто</span>}</td>
                        <td>
                          <div className="rowActions">
                            <button
                              type="button"
                              className="iconBtn iconBtn-secondary"
                              aria-label="Выше"
                              title="Выше"
                              onClick={() => void swapProducts(index, index - 1)}
                              disabled={!canMoveUp}
                            >
                              <ChevronUpIcon />
                            </button>
                            <button
                              type="button"
                              className="iconBtn iconBtn-secondary"
                              aria-label="Ниже"
                              title="Ниже"
                              onClick={() => void swapProducts(index, index + 1)}
                              disabled={!canMoveDown}
                            >
                              <ChevronDownIcon />
                            </button>
                            <button
                              type="button"
                              className="iconBtn iconBtn-secondary"
                              aria-label="Изменить"
                              title="Изменить"
                              onClick={() => startEditProduct(item)}
                            >
                              <PencilIcon />
                            </button>
                            <button
                              type="button"
                              className="iconBtn iconBtn-secondary"
                              aria-label={visible ? "Скрыть" : "Показать"}
                              title={visible ? "Скрыть" : "Показать"}
                              onClick={() => void onToggleProductVisibility(item)}
                            >
                              {visible ? <EyeOffIcon /> : <EyeIcon />}
                            </button>
                            <button
                              type="button"
                              className="iconBtn iconBtn-danger"
                              aria-label="Удалить"
                              title="Удалить"
                              onClick={() => void onDeleteProduct(item)}
                            >
                              <TrashIcon />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {isEditing ? (
                        <tr>
                          <td colSpan={4}>{productEditor}</td>
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
