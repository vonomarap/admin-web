"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { Globe, Handshake, Save } from "lucide-react";
import { db } from "../../../lib/firebase";
import { useAdminSession } from "../../../components/AdminSessionProvider";
import { AdminLoginScreen, LoadingScreen, MissingConfigScreen, NoAccessScreen } from "../../../components/AdminScreens";
import { AdminShell } from "../../../components/AdminShell";
import { FieldBlock, InlineMeta, PageAlert, SectionCard, SwitchField } from "../../../components/admin-kit";
import { MediaUploadButton } from "../../../components/forms/MediaUploadButton";
import { ImageThumbPreview } from "../../../components/forms/ImageThumbPreview";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Textarea } from "../../../components/ui/textarea";

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeText(value: string): string {
  return (value || "").trim();
}

export default function SiteSettingsPage(): JSX.Element {
  const session = useAdminSession();

  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [saving, setSaving] = useState(false);

  const [brandName, setBrandName] = useState("");
  const [tagline, setTagline] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [telegram, setTelegram] = useState("");
  const [maxUrl, setMaxUrl] = useState("");
  const [copyrightText, setCopyrightText] = useState("");

  const [partnerEnabled, setPartnerEnabled] = useState(true);
  const [partnerKicker, setPartnerKicker] = useState("");
  const [partnerFactoryName, setPartnerFactoryName] = useState("");
  const [partnerDescription, setPartnerDescription] = useState("");
  const [partnerLogoUrl, setPartnerLogoUrl] = useState("");
  const [partnerBulletsText, setPartnerBulletsText] = useState("");

  const hasChanges = useMemo(
    () =>
      Boolean(
        brandName.trim() ||
          tagline.trim() ||
          phone.trim() ||
          email.trim() ||
          whatsapp.trim() ||
          telegram.trim() ||
          maxUrl.trim() ||
          copyrightText.trim() ||
          partnerEnabled === false ||
          partnerKicker.trim() ||
          partnerFactoryName.trim() ||
          partnerDescription.trim() ||
          partnerLogoUrl.trim() ||
          partnerBulletsText.trim()
      ),
    [
      brandName,
      copyrightText,
      partnerBulletsText,
      partnerDescription,
      partnerEnabled,
      partnerFactoryName,
      partnerKicker,
      partnerLogoUrl,
      phone,
      email,
      tagline,
      telegram,
      maxUrl,
      whatsapp,
    ]
  );

  const load = useCallback(async () => {
    if (!db) return;

    setLoadError(null);
    setLoadingData(true);
    try {
      const ref = doc(db, "app_settings", "site");
      const snap = await getDoc(ref);
      const data = snap.exists() ? (snap.data() as Record<string, unknown>) : {};

      setBrandName(asString(data.brandName));
      setTagline(asString(data.tagline));
      setPhone(asString(data.phone));
      setEmail(asString(data.email));
      setWhatsapp(asString(data.whatsapp));
      setTelegram(asString(data.telegram));
      setMaxUrl(asString(data.maxUrl));
      setCopyrightText(asString(data.copyrightText));

      setPartnerEnabled(typeof data.partnerEnabled === "boolean" ? data.partnerEnabled : true);
      setPartnerKicker(asString(data.partnerKicker));
      setPartnerFactoryName(asString(data.partnerFactoryName));
      setPartnerDescription(asString(data.partnerDescription));
      setPartnerLogoUrl(asString(data.partnerLogoUrl));

      const bullets = Array.isArray(data.partnerBullets)
        ? data.partnerBullets
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim())
            .filter(Boolean)
        : [];
      setPartnerBulletsText(bullets.join("\n"));
    } catch (error) {
      console.error("Admin load site settings failed:", error);
      setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (session.status !== "ready") return;
    void load();
  }, [load, session.status]);

  const onSave = async () => {
    if (!db) return;

    setSaveError(null);
    setSaving(true);
    try {
      const ref = doc(db, "app_settings", "site");
      const partnerBullets = partnerBulletsText
        .split("\n")
        .map((item) => normalizeText(item))
        .filter(Boolean);
      const payload: Record<string, unknown> = {
        brandName: normalizeText(brandName),
        tagline: normalizeText(tagline),
        phone: normalizeText(phone),
        email: normalizeText(email),
        whatsapp: normalizeText(whatsapp),
        telegram: normalizeText(telegram),
        maxUrl: normalizeText(maxUrl),
        copyrightText: normalizeText(copyrightText),
        partnerEnabled,
        partnerKicker: normalizeText(partnerKicker),
        partnerFactoryName: normalizeText(partnerFactoryName),
        partnerDescription: normalizeText(partnerDescription),
        partnerLogoUrl: normalizeText(partnerLogoUrl),
        partnerBullets,
        updatedAt: serverTimestamp(),
      };

      await setDoc(ref, payload, { merge: true });
      await load();
    } catch (error) {
      console.error("Admin save site settings failed:", error);
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  if (session.status === "loading") return <LoadingScreen />;
  if (session.status === "missing_config") return <MissingConfigScreen />;
  if (session.status === "signed_out") return <AdminLoginScreen title="Сайт" subtitle="Войдите под админским аккаунтом" />;
  if (session.status === "not_admin" || session.status === "role_check_failed") return <NoAccessScreen />;

  return (
    <AdminShell
      title="Сайт"
      subtitle={session.user?.email ?? ""}
      rightActions={
        <>
          <Button onClick={() => void onSave()} disabled={saving}>
            <Save data-icon="inline-start" />
            {saving ? "Сохранение..." : "Сохранить"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        {loadError ? <PageAlert title="Ошибка загрузки" description={loadError} /> : null}
        {saveError ? <PageAlert title="Ошибка сохранения" description={saveError} /> : null}

        <SectionCard
          eyebrow="Публичная часть"
          title="Футер и контакты"
          description="Основные публичные контакты и брендовые тексты, которые используются на сайте."
          icon={Globe}
          tone="slate"
          footer={
            <>
              <InlineMeta
                items={[
                  hasChanges ? "Есть несохраненные изменения" : "Изменений нет",
                  "Firestore → app_settings/site",
                ]}
              />
              <Button type="button" onClick={() => void onSave()} disabled={saving}>
                {saving ? "Сохранение..." : "Сохранить"}
              </Button>
            </>
          }
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <FieldBlock label="Бренд">
              <Input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="KanOkna" />
            </FieldBlock>

            <FieldBlock label="Слоган">
              <Input value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Окна и двери под ключ" />
            </FieldBlock>

            <FieldBlock label="Телефон" description="Будет кликабельно как `tel:`.">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7 999 123-45-67" />
            </FieldBlock>

            <FieldBlock label="Email" description="Будет кликабельно как `mailto:`.">
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
            </FieldBlock>

            <FieldBlock label="WhatsApp">
              <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="+7 999 123-45-67 или https://wa.me/..." />
            </FieldBlock>

            <FieldBlock label="Telegram">
              <Input value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="@username или https://t.me/..." />
            </FieldBlock>

            <FieldBlock label="MAX" description="Укажите готовую ссылку на профиль или чат MAX.">
              <Input value={maxUrl} onChange={(e) => setMaxUrl(e.target.value)} placeholder="https://max.ru/..." />
            </FieldBlock>

            <FieldBlock label="Копирайт">
              <Input value={copyrightText} onChange={(e) => setCopyrightText(e.target.value)} placeholder="© 2026 KanOkna" />
            </FieldBlock>
          </div>
        </SectionCard>

        <SectionCard
          eyebrow="Главная страница"
          title="Блок официального партнера"
          description="Промо-блок на главной после популярных товаров. Управляет видимостью, текстами и логотипом."
          icon={Handshake}
          tone="slate"
          footer={
            <div className="flex w-full justify-end">
              <Button type="button" onClick={() => void onSave()} disabled={saving}>
                {saving ? "Сохранение..." : "Сохранить"}
              </Button>
            </div>
          }
        >
          <div className="grid gap-4">
            <SwitchField
              title={partnerEnabled ? "Блок включен" : "Блок выключен"}
              description="Если выключить, партнёрский блок полностью скрывается на главной."
              checked={partnerEnabled}
              onCheckedChange={setPartnerEnabled}
            />

            <div className="grid gap-4 lg:grid-cols-2">
              <FieldBlock label="Кикер">
                <Input value={partnerKicker} onChange={(e) => setPartnerKicker(e.target.value)} placeholder="Официальный партнер" />
              </FieldBlock>

              <FieldBlock label="Название фабрики">
                <Input
                  value={partnerFactoryName}
                  onChange={(e) => setPartnerFactoryName(e.target.value)}
                  placeholder="Фабрика Дышащих Окон"
                />
              </FieldBlock>

              <FieldBlock label="Описание" className="lg:col-span-2">
                <Textarea
                  rows={4}
                  value={partnerDescription}
                  onChange={(e) => setPartnerDescription(e.target.value)}
                  placeholder="Работаем напрямую с производством. Оригинальные комплектующие и гарантия."
                />
              </FieldBlock>

              <FieldBlock
                label="URL логотипа"
                description="Если поле пустое, на сайте будет иконка вместо логотипа."
                className="lg:col-span-2"
              >
                <div className="grid gap-3">
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Input
                      value={partnerLogoUrl}
                      onChange={(e) => setPartnerLogoUrl(e.target.value)}
                      placeholder="https://..."
                      autoCapitalize="none"
                    />
                    <MediaUploadButton
                      folder="site"
                      label="Загрузить"
                      disabled={saving}
                      onUploaded={(urls) => setPartnerLogoUrl(urls[0] ?? "")}
                    />
                  </div>
                  <ImageThumbPreview url={partnerLogoUrl} />
                </div>
              </FieldBlock>

              <FieldBlock label="Буллеты" description="Каждая строка станет отдельным пунктом." className="lg:col-span-2">
                <Textarea
                  rows={5}
                  value={partnerBulletsText}
                  onChange={(e) => setPartnerBulletsText(e.target.value)}
                  placeholder={"Прямые поставки с производства\nОригинальные комплектующие\nГарантия и поддержка"}
                />
              </FieldBlock>
            </div>
          </div>
        </SectionCard>
      </div>
    </AdminShell>
  );
}
