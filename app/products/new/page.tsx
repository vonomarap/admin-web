"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { ArrowLeft, PackagePlus } from "lucide-react";
import { db } from "../../../lib/firebase";
import { useAdminSession } from "../../../components/AdminSessionProvider";
import { AdminLoginScreen, LoadingScreen, MissingConfigScreen, NoAccessScreen } from "../../../components/AdminScreens";
import { AdminShell } from "../../../components/AdminShell";
import { FieldBlock, PageAlert, SectionCard, SwitchField } from "../../../components/admin-kit";
import { ImageThumbPreview } from "../../../components/forms/ImageThumbPreview";
import { MediaUploadButton } from "../../../components/forms/MediaUploadButton";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { NativeSelect } from "../../../components/ui/native-select";
import { Textarea } from "../../../components/ui/textarea";

export default function ProductCreatePage(): JSX.Element {
  const session = useAdminSession();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priceFrom, setPriceFrom] = useState("");
  const [image, setImage] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goBack = () => router.push("/products");
  const canSave = Boolean(title.trim()) && !saving;

  if (session.status === "loading") return <LoadingScreen />;
  if (session.status === "missing_config") return <MissingConfigScreen />;
  if (session.status === "signed_out") return <AdminLoginScreen title="Добавить товар" subtitle="Войдите под админским аккаунтом" />;
  if (session.status === "not_admin" || session.status === "role_check_failed") return <NoAccessScreen />;

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!db) return;

    const parsedPrice = Number(priceFrom);
    const payload = {
      title: title.trim(),
      description: description.trim() || undefined,
      priceFrom: Number.isFinite(parsedPrice) ? parsedPrice : undefined,
      currency: "RUB",
      image: image.trim() || undefined,
      active,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

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
        <Button type="button" variant="outline" onClick={goBack} disabled={saving}>
          <ArrowLeft data-icon="inline-start" />
          Назад
        </Button>
      }
    >
      <div className="flex flex-col gap-6">
        <SectionCard
          eyebrow="Каталог"
          title="Новый товар"
          description="Создайте базовую карточку каталога. Детальные особенности и спецификации можно дополнить позже прямо в списке товаров."
          actions={<PackagePlus className="size-5 text-icon-accent" />}
        >
          <form onSubmit={onSubmit} className="grid gap-6">
            <div className="grid gap-4 lg:grid-cols-2">
              <FieldBlock label="Название">
                <Input placeholder="Название" value={title} onChange={(e) => setTitle(e.target.value)} required />
              </FieldBlock>

              <FieldBlock label="Цена от">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
                  <Input placeholder="Цена от" value={priceFrom} onChange={(e) => setPriceFrom(e.target.value)} inputMode="decimal" />
                  <NativeSelect value="RUB" disabled>
                    <option value="RUB">RUB</option>
                  </NativeSelect>
                </div>
              </FieldBlock>

              <FieldBlock label="Описание" className="lg:col-span-2">
                <Textarea
                  rows={4}
                  placeholder="Описание (опционально)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </FieldBlock>

              <FieldBlock
                label="Изображение"
                description="Можно загрузить фото в «Медиа» и вставить URL сюда."
                className="lg:col-span-2"
              >
                <div className="grid gap-3">
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Input
                      placeholder="Ссылка на изображение (опционально)"
                      value={image}
                      onChange={(e) => setImage(e.target.value)}
                      autoCapitalize="none"
                    />
                    <MediaUploadButton
                      folder="products"
                      label="Загрузить"
                      disabled={saving}
                      onUploaded={(urls) => setImage(urls[0] ?? "")}
                    />
                  </div>
                  <ImageThumbPreview url={image} />
                </div>
              </FieldBlock>
            </div>

            <SwitchField
              title="Показывать в каталоге"
              description="Если отключить, товар сохранится в базе, но не будет виден на витрине."
              checked={active}
              onCheckedChange={setActive}
            />

            {error ? <PageAlert title="Не удалось создать товар" description={error} /> : null}

            <div className="flex flex-wrap justify-end gap-3">
              <Button type="button" variant="outline" onClick={goBack} disabled={saving}>
                Отмена
              </Button>
              <Button type="submit" disabled={!canSave}>
                {saving ? "Сохранение..." : "Сохранить"}
              </Button>
            </div>
          </form>
        </SectionCard>
      </div>
    </AdminShell>
  );
}
