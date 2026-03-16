"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { signOut } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../../../lib/firebase";
import { useAdminSession } from "../../../components/AdminSessionProvider";
import { AdminLoginScreen, LoadingScreen, MissingConfigScreen, NoAccessScreen } from "../../../components/AdminScreens";
import { AdminShell } from "../../../components/AdminShell";
import { MediaUploadButton } from "../../../components/forms/MediaUploadButton";
import { ImageThumbPreview } from "../../../components/forms/ImageThumbPreview";

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeText(value: string): string {
  const trimmed = (value || "").trim();
  return trimmed;
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
  const [whatsapp, setWhatsapp] = useState("");
  const [telegram, setTelegram] = useState("");
  const [copyrightText, setCopyrightText] = useState("");

  const [partnerEnabled, setPartnerEnabled] = useState(true);
  const [partnerKicker, setPartnerKicker] = useState("");
  const [partnerFactoryName, setPartnerFactoryName] = useState("");
  const [partnerDescription, setPartnerDescription] = useState("");
  const [partnerLogoUrl, setPartnerLogoUrl] = useState("");
  const [partnerBulletsText, setPartnerBulletsText] = useState("");

  const hasChanges = useMemo(() => {
    return Boolean(
      brandName.trim() ||
        tagline.trim() ||
        phone.trim() ||
        whatsapp.trim() ||
        telegram.trim() ||
        copyrightText.trim() ||
        partnerEnabled === false ||
        partnerKicker.trim() ||
        partnerFactoryName.trim() ||
        partnerDescription.trim() ||
        partnerLogoUrl.trim() ||
        partnerBulletsText.trim()
    );
  }, [
    brandName,
    copyrightText,
    partnerBulletsText,
    partnerDescription,
    partnerEnabled,
    partnerFactoryName,
    partnerKicker,
    partnerLogoUrl,
    phone,
    tagline,
    telegram,
    whatsapp
  ]);

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
      setWhatsapp(asString(data.whatsapp));
      setTelegram(asString(data.telegram));
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
        whatsapp: normalizeText(whatsapp),
        telegram: normalizeText(telegram),
        copyrightText: normalizeText(copyrightText),
        partnerEnabled,
        partnerKicker: normalizeText(partnerKicker),
        partnerFactoryName: normalizeText(partnerFactoryName),
        partnerDescription: normalizeText(partnerDescription),
        partnerLogoUrl: normalizeText(partnerLogoUrl),
        partnerBullets,
        updatedAt: serverTimestamp()
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
          <button className="secondary" onClick={() => void load()} disabled={loadingData || saving}>
            Обновить
          </button>
          <button onClick={() => void onSave()} disabled={saving}>
            {saving ? "Сохранение..." : "Сохранить"}
          </button>
          <button onClick={() => void signOut(auth!)} disabled={!auth}>
            Выйти
          </button>
        </>
      }
    >
      {loadError ? (
        <section className="card noticeCard noticeCard-error">
          <h3 style={{ marginBottom: 6 }}>Ошибка загрузки</h3>
          <small className="noticeText-danger">{loadError}</small>
        </section>
      ) : null}

      {saveError ? <div className="errorBox">{saveError}</div> : null}

      <section className="card">
        <div className="rowActions" style={{ justifyContent: "space-between" }}>
          <div style={{ display: "grid", gap: 2 }}>
            <h2>Футер</h2>
            <small>Контакты и ссылки для сайта</small>
          </div>
          <small>Данные: Firestore → app_settings/site</small>
        </div>

        <div className="editPanel" style={{ marginTop: 12 }}>
          <div className="editGrid">
            <div className="field">
              <div className="fieldLabel">Бренд (название)</div>
              <input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="KanOkna" />
            </div>

            <div className="field">
              <div className="fieldLabel">Слоган</div>
              <input value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Окна и двери под ключ" />
            </div>

            <div className="field">
              <div className="fieldLabel">Телефон</div>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7 999 123-45-67" />
              <small>Будет кликабельно (tel:)</small>
            </div>

            <div className="field">
              <div className="fieldLabel">WhatsApp</div>
              <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="+7 999 123-45-67 или https://wa.me/..." />
            </div>

            <div className="field">
              <div className="fieldLabel">Telegram</div>
              <input value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="@username или https://t.me/..." />
            </div>

            <div className="field">
              <div className="fieldLabel">Копирайт</div>
              <input value={copyrightText} onChange={(e) => setCopyrightText(e.target.value)} placeholder="© 2026 KanOkna" />
            </div>
          </div>

          <div className="filtersFooter" style={{ justifyContent: "space-between" }}>
            <small>
              {hasChanges ? "Есть изменения" : "Изменений нет"} • Пустые поля будут скрыты на сайте
            </small>
            <button type="button" onClick={() => void onSave()} disabled={saving}>
              {saving ? "Сохранение..." : "Сохранить"}
            </button>
	          </div>
	        </div>
	      </section>

        <section className="card">
          <div className="rowActions" style={{ justifyContent: "space-between" }}>
            <div style={{ display: "grid", gap: 2 }}>
              <h2>Официальный партнер (главная)</h2>
              <small>Блок на главной странице после «Популярное»</small>
            </div>
            <small>Данные: Firestore → app_settings/site</small>
          </div>

          <div className="editPanel">
            <div className="editGrid">
              <div className="field">
                <div className="fieldLabel">Показывать блок</div>
                <label className="row" style={{ gap: 10, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={partnerEnabled}
                    onChange={(e) => setPartnerEnabled(e.target.checked)}
                  />
                  <span>{partnerEnabled ? "Включен" : "Выключен"}</span>
                </label>
              </div>

              <div className="field">
                <div className="fieldLabel">Кикер</div>
                <input
                  value={partnerKicker}
                  onChange={(e) => setPartnerKicker(e.target.value)}
                  placeholder="Официальный партнер"
                />
              </div>

              <div className="field">
                <div className="fieldLabel">Название фабрики</div>
                <input
                  value={partnerFactoryName}
                  onChange={(e) => setPartnerFactoryName(e.target.value)}
                  placeholder="Фабрика Дышащих Окон"
                />
              </div>

              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <div className="fieldLabel">Описание</div>
                <textarea
                  rows={3}
                  value={partnerDescription}
                  onChange={(e) => setPartnerDescription(e.target.value)}
                  placeholder="Работаем напрямую с производством. Оригинальные комплектующие и гарантия."
                />
              </div>

              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <div className="fieldLabel">URL логотипа</div>
                <div className="rowActions" style={{ alignItems: "stretch" }}>
                  <input
                    value={partnerLogoUrl}
                    onChange={(e) => setPartnerLogoUrl(e.target.value)}
                    placeholder="https://..."
                    autoCapitalize="none"
                    style={{ flex: 1, minWidth: 0 }}
                  />
                  <MediaUploadButton
                    folder="site"
                    label="Загрузить"
                    disabled={saving}
                    onUploaded={(urls) => setPartnerLogoUrl(urls[0] ?? "")}
                  />
                </div>
                <ImageThumbPreview url={partnerLogoUrl} />
                <small>Если поле пустое, на сайте будет иконка вместо логотипа.</small>
              </div>

              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <div className="fieldLabel">Буллеты (по строке на пункт)</div>
                <textarea
                  rows={4}
                  value={partnerBulletsText}
                  onChange={(e) => setPartnerBulletsText(e.target.value)}
                  placeholder={"Прямые поставки с производства\nОригинальные комплектующие\nГарантия и поддержка"}
                />
              </div>
            </div>

            <div className="filtersFooter" style={{ justifyContent: "flex-end" }}>
              <button type="button" onClick={() => void onSave()} disabled={saving}>
                {saving ? "Сохранение..." : "Сохранить"}
              </button>
            </div>
          </div>
        </section>
	    </AdminShell>
	  );
}
