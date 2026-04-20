"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { ArrowLeft, ImagePlus } from "lucide-react";
import { db } from "../../../lib/firebase";
import { useAdminSession } from "../../../components/AdminSessionProvider";
import { AdminLoginScreen, LoadingScreen, MissingConfigScreen, NoAccessScreen } from "../../../components/AdminScreens";
import { AdminShell } from "../../../components/AdminShell";
import { FieldBlock, PageAlert, SectionCard, SwitchField } from "../../../components/admin-kit";
import { ImageUrlList } from "../../../components/forms/ImageUrlList";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";

export default function GalleryCreatePage(): JSX.Element {
  const session = useAdminSession();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [city, setCity] = useState("");
  const [projectType, setProjectType] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goBack = () => router.push("/gallery");
  const canSave = Boolean(title.trim()) && !saving;

  if (session.status === "loading") return <LoadingScreen />;
  if (session.status === "missing_config") return <MissingConfigScreen />;
  if (session.status === "signed_out") return <AdminLoginScreen title="Добавить кейс" subtitle="Войдите под админским аккаунтом" />;
  if (session.status === "not_admin" || session.status === "role_check_failed") return <NoAccessScreen />;

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!db) return;

    const payload = {
      title: title.trim(),
      city: city.trim() || undefined,
      projectType: projectType.trim() || undefined,
      images: images.filter(Boolean),
      active,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

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
        <Button type="button" variant="outline" onClick={goBack} disabled={saving}>
          <ArrowLeft data-icon="inline-start" />
          Назад
        </Button>
      }
    >
      <div className="flex flex-col gap-6">
        <SectionCard
          eyebrow="Портфолио"
          title="Новый кейс"
          description="Создайте карточку выполненного проекта. Первое изображение из списка будет использоваться как обложка."
          actions={<ImagePlus className="size-5 text-icon-accent" />}
        >
          <form onSubmit={onSubmit} className="grid gap-6">
            <div className="grid gap-4 lg:grid-cols-2">
              <FieldBlock label="Название" className="lg:col-span-2">
                <Input placeholder="Название" value={title} onChange={(e) => setTitle(e.target.value)} required />
              </FieldBlock>

              <FieldBlock label="Город">
                <Input placeholder="Город" value={city} onChange={(e) => setCity(e.target.value)} />
              </FieldBlock>

              <FieldBlock label="Тип проекта">
                <Input
                  placeholder="Тип проекта (например: окно/дверь)"
                  value={projectType}
                  onChange={(e) => setProjectType(e.target.value)}
                />
              </FieldBlock>

              <div className="lg:col-span-2">
                <ImageUrlList
                  title="Фотографии"
                  subtitle="Добавьте одну или несколько ссылок на изображения, или загрузите файлы."
                  value={images}
                  resetKey="new"
                  onChange={setImages}
                  disabled={saving}
                  uploadFolder="gallery"
                />
              </div>
            </div>

            <SwitchField
              title="Показывать в приложении"
              description="Если отключить публикацию, кейс останется в базе, но не будет виден пользователям."
              checked={active}
              onCheckedChange={setActive}
            />

            {error ? <PageAlert title="Не удалось создать кейс" description={error} /> : null}

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
