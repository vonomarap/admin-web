"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Package } from "lucide-react";
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
import { db } from "../../lib/firebase";
import { useConfirmDialog } from "../../components/ConfirmDialogProvider";
import { AdminLoginScreen, LoadingScreen, MissingConfigScreen, NoAccessScreen } from "../../components/AdminScreens";
import { useAdminSession } from "../../components/AdminSessionProvider";
import { AdminShell } from "../../components/AdminShell";
import {
  ActionIconButton,
  EmptyState,
  FieldBlock,
  PageAlert,
  SectionCard,
  SwitchField,
  ToneBadge,
} from "../../components/admin-kit";
import { ChevronDownIcon, ChevronUpIcon, EyeIcon, EyeOffIcon, PencilIcon, TrashIcon } from "../../components/Icons";
import { MediaUploadButton } from "../../components/forms/MediaUploadButton";
import { ImageThumbPreview } from "../../components/forms/ImageThumbPreview";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { NativeSelect } from "../../components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Textarea } from "../../components/ui/textarea";

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
  const confirm = useConfirmDialog();

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
    const ok = await confirm({
      title: "Инициализировать порядок каталога?",
      description: "Текущий manual sort order будет перезаписан алфавитным порядком A–Z.",
      confirmLabel: "Пересчитать",
      variant: "destructive",
    });
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
    const ok = await confirm({
      title: `Удалить товар "${item.title}"?`,
      description: "Это действие необратимо.",
      confirmLabel: "Удалить",
      variant: "destructive",
    });
    if (!ok) return;
    await deleteDoc(doc(db, "products", item.id));
    await loadProducts();
  };

  const productEditor = (
    <Card className="border-border/80 bg-background/60">
      <CardHeader className="gap-1">
        <CardTitle className="text-lg">Редактирование товара</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6 pt-0">
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="grid gap-4">
            <FieldBlock label="Название">
              <Input
                placeholder="Название"
                value={productDraft.title}
                onChange={(e) => setProductDraft((prev) => ({ ...prev, title: e.target.value }))}
              />
            </FieldBlock>
            <FieldBlock label="Описание">
              <Textarea
                rows={4}
                placeholder="Описание"
                value={productDraft.description}
                onChange={(e) => setProductDraft((prev) => ({ ...prev, description: e.target.value }))}
              />
            </FieldBlock>
            <FieldBlock label="Цена от">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
                <Input
                  placeholder="Цена от"
                  value={productDraft.priceFrom}
                  onChange={(e) => setProductDraft((prev) => ({ ...prev, priceFrom: e.target.value }))}
                />
                <NativeSelect value="RUB" disabled>
                  <option value="RUB">RUB</option>
                </NativeSelect>
              </div>
            </FieldBlock>
            <FieldBlock label="Изображение" description="Можно загрузить фото в «Медиа» и вставить URL сюда.">
              <div className="grid gap-3">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Input
                    placeholder="Ссылка на изображение"
                    value={productDraft.image}
                    onChange={(e) => setProductDraft((prev) => ({ ...prev, image: e.target.value }))}
                    autoCapitalize="none"
                  />
                  <MediaUploadButton
                    folder="products"
                    label="Загрузить"
                    disabled={productSaving}
                    onUploaded={(urls) => setProductDraft((prev) => ({ ...prev, image: urls[0] ?? "" }))}
                  />
                </div>
                <ImageThumbPreview url={productDraft.image} />
              </div>
            </FieldBlock>
            <SwitchField
              title="Показывать в каталоге"
              checked={productDraft.active}
              onCheckedChange={(checked) => setProductDraft((prev) => ({ ...prev, active: checked }))}
            />
          </div>

          <div className="grid gap-4">
            <FieldBlock label="Особенности">
              <Textarea
                rows={8}
                placeholder="Особенности (по одной на строку)"
                value={productDraft.features}
                onChange={(e) => setProductDraft((prev) => ({ ...prev, features: e.target.value }))}
              />
            </FieldBlock>
            <FieldBlock label="Характеристики JSON">
              <Textarea
                rows={8}
                className="font-mono text-xs"
                placeholder='Характеристики (JSON, например: {"Профиль":"KBE"})'
                value={productDraft.specs}
                onChange={(e) => setProductDraft((prev) => ({ ...prev, specs: e.target.value }))}
                spellCheck={false}
              />
            </FieldBlock>
          </div>
        </div>

        {productDraftError ? <PageAlert title="Не удалось сохранить товар" description={productDraftError} /> : null}

        <div className="flex flex-wrap justify-end gap-3">
          <Button type="button" variant="outline" onClick={cancelEditProduct} disabled={productSaving}>
            Отмена
          </Button>
          <Button type="button" onClick={() => void onSaveProduct()} disabled={productSaving}>
            {productSaving ? "Сохранение..." : "Сохранить"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  if (session.status === "loading") return <LoadingScreen />;
  if (session.status === "missing_config") return <MissingConfigScreen />;
  if (session.status === "signed_out") return <AdminLoginScreen title="Товары" subtitle="Войдите под админским аккаунтом" />;
  if (session.status === "not_admin" || session.status === "role_check_failed") return <NoAccessScreen />;

  return (
    <AdminShell
      title="Товары"
      subtitle={session.user?.email ?? ""}
    >
      <div className="flex flex-col gap-6">
        {loadError ? <PageAlert title="Ошибка загрузки данных" description={loadError} /> : null}
        {orderError ? <PageAlert title="Ошибка изменения порядка" description={orderError} /> : null}
        {hasMissingSortOrder ? (
          <PageAlert
            variant="warning"
            title="Порядок каталога не задан"
            description={
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>Нажмите «Инициализировать», чтобы включить сортировку и кнопки ↑/↓.</span>
                <Button type="button" variant="secondary" onClick={() => void onInitializeSortOrder()} disabled={orderBusy || loadingData}>
                  {orderBusy ? "Инициализация..." : "Инициализировать"}
                </Button>
              </div>
            }
          />
        ) : null}

        <SectionCard
          eyebrow="Каталог"
          title="Товары"
          description="Управление порядком, видимостью и контентом каталога."
          icon={Package}
          tone="emerald"
          footer={
            <>
              <div className="text-sm text-muted-foreground">{products.length} шт. • Порядок: используйте ↑/↓.</div>
              <Badge variant="outline">Firestore → products</Badge>
            </>
          }
        >
          {!products.length ? (
            <EmptyState title="Пока нет товаров" description="Добавьте первый товар, чтобы наполнить каталог." />
          ) : (
            <div className="grid gap-4">
              <div className="grid gap-3 lg:hidden">
                {productsOrdered.map((item, index) => {
                  const visible = isVisible(item.active);
                  const isEditing = editingProductId === item.id;
                  const canMoveUp = !orderBusy && !hasMissingSortOrder && index > 0;
                  const canMoveDown = !orderBusy && !hasMissingSortOrder && index < productsOrdered.length - 1;

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
                        <div className="text-sm text-muted-foreground">Цена</div>
                        <div className="text-lg font-semibold text-foreground">{formatCurrency(item.priceFrom ?? 0, item.currency)}</div>
                        <div className="flex flex-wrap justify-end gap-2">
                          <ActionIconButton aria-label="Выше" title="Выше" onClick={() => void swapProducts(index, index - 1)} disabled={!canMoveUp}>
                            <ChevronUpIcon />
                          </ActionIconButton>
                          <ActionIconButton aria-label="Ниже" title="Ниже" onClick={() => void swapProducts(index, index + 1)} disabled={!canMoveDown}>
                            <ChevronDownIcon />
                          </ActionIconButton>
                          <ActionIconButton aria-label="Изменить" title="Изменить" onClick={() => startEditProduct(item)}>
                            <PencilIcon />
                          </ActionIconButton>
                          <ActionIconButton
                            aria-label={visible ? "Скрыть" : "Показать"}
                            title={visible ? "Скрыть" : "Показать"}
                            onClick={() => void onToggleProductVisibility(item)}
                          >
                            {visible ? <EyeOffIcon /> : <EyeIcon />}
                          </ActionIconButton>
                          <ActionIconButton variant="destructive" aria-label="Удалить" title="Удалить" onClick={() => void onDeleteProduct(item)}>
                            <TrashIcon />
                          </ActionIconButton>
                        </div>
                        {isEditing ? productEditor : null}
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
                      <TableHead>Цена</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead>Действия</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productsOrdered.map((item, index) => {
                      const visible = isVisible(item.active);
                      const isEditing = editingProductId === item.id;
                      const canMoveUp = !orderBusy && !hasMissingSortOrder && index > 0;
                      const canMoveDown = !orderBusy && !hasMissingSortOrder && index < productsOrdered.length - 1;

                      return (
                        <Fragment key={item.id}>
                          <TableRow>
                            <TableCell>
                              <div className="grid gap-1">
                                <b>{item.title}</b>
                                <small className="breakLong">{item.id}</small>
                              </div>
                            </TableCell>
                            <TableCell>{formatCurrency(item.priceFrom ?? 0, item.currency)}</TableCell>
                            <TableCell>
                              {visible ? <ToneBadge tone="default">Показано</ToneBadge> : <ToneBadge tone="muted">Скрыто</ToneBadge>}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-2">
                                <ActionIconButton aria-label="Выше" title="Выше" onClick={() => void swapProducts(index, index - 1)} disabled={!canMoveUp}>
                                  <ChevronUpIcon />
                                </ActionIconButton>
                                <ActionIconButton aria-label="Ниже" title="Ниже" onClick={() => void swapProducts(index, index + 1)} disabled={!canMoveDown}>
                                  <ChevronDownIcon />
                                </ActionIconButton>
                                <ActionIconButton aria-label="Изменить" title="Изменить" onClick={() => startEditProduct(item)}>
                                  <PencilIcon />
                                </ActionIconButton>
                                <ActionIconButton
                                  aria-label={visible ? "Скрыть" : "Показать"}
                                  title={visible ? "Скрыть" : "Показать"}
                                  onClick={() => void onToggleProductVisibility(item)}
                                >
                                  {visible ? <EyeOffIcon /> : <EyeIcon />}
                                </ActionIconButton>
                                <ActionIconButton variant="destructive" aria-label="Удалить" title="Удалить" onClick={() => void onDeleteProduct(item)}>
                                  <TrashIcon />
                                </ActionIconButton>
                              </div>
                            </TableCell>
                          </TableRow>
                          {isEditing ? (
                            <TableRow>
                              <TableCell colSpan={4}>{productEditor}</TableCell>
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
