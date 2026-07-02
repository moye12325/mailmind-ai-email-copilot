"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { AppShell } from "@/components/app-shell";
import { InlineFeedback } from "@/components/inline-feedback";
import { PageFrame } from "@/components/page-frame";
import { SettingsSection, SettingRow } from "@/components/settings-section";
import { StatusBanner } from "@/components/status-banner";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/provider";

interface DesktopSettings {
  appUrl: string;
  healthUrl: string;
  minimizeToTray: boolean;
  showWindowOnStartup: boolean;
  notificationsEnabled: boolean;
}

interface DesktopDiagnosticsSnapshot {
  app: {
    name: string;
    version: string;
    platform: string;
  };
  endpoints: {
    appUrl: string;
    healthUrl: string;
  };
  behavior: {
    minimizeToTray: boolean;
    showWindowOnStartup: boolean;
    notificationsEnabled: boolean;
  };
  connection: {
    healthy: boolean | null;
    checkedAt: string | null;
    source: "startup" | "retry" | "poll";
    detail: string;
  };
  logDirectory: string;
}

interface DesktopElectronAPI {
  getDesktopConfig(): Promise<DesktopSettings>;
  saveDesktopConfig(input: DesktopSettings): Promise<DesktopSettings>;
  getDesktopDiagnostics(): Promise<DesktopDiagnosticsSnapshot>;
  copyDesktopDiagnostics(): Promise<string>;
  openDesktopLogs(): Promise<void>;
  openDesktopSettings(): Promise<void>;
  retryConnection(): Promise<boolean>;
}

function getDesktopApi(): DesktopElectronAPI | null {
  if (typeof window === "undefined") {
    return null;
  }

  const candidate = (window as Window & {
    electronAPI?: Partial<DesktopElectronAPI>;
  }).electronAPI;

  if (
    !candidate?.getDesktopConfig ||
    !candidate.saveDesktopConfig ||
    !candidate.getDesktopDiagnostics ||
    !candidate.copyDesktopDiagnostics ||
    !candidate.openDesktopLogs ||
    !candidate.openDesktopSettings ||
    !candidate.retryConnection
  ) {
    return null;
  }

  return candidate as DesktopElectronAPI;
}

function connectionStatusLabel(
  t: ReturnType<typeof useI18n>["t"],
  healthy: boolean | null,
): string {
  if (healthy === true) {
    return t("desktop.connectionHealthy");
  }

  if (healthy === false) {
    return t("desktop.connectionUnhealthy");
  }

  return t("desktop.connectionUnknown");
}

export default function DesktopSettingsPage() {
  const { t } = useI18n();
  const desktopApi = useMemo(() => getDesktopApi(), []);
  const [loading, setLoading] = useState(desktopApi !== null);
  const [saving, setSaving] = useState(false);
  const [desktopAvailable, setDesktopAvailable] = useState<boolean>(desktopApi !== null);
  const [form, setForm] = useState<DesktopSettings | null>(null);
  const [diagnostics, setDiagnostics] = useState<DesktopDiagnosticsSnapshot | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDesktopState = useCallback(async () => {
    if (desktopApi === null) {
      setDesktopAvailable(false);
      setLoading(false);
      return;
    }

    setDesktopAvailable(true);
    setLoading(true);
    setError(null);

    try {
      const [nextConfig, nextDiagnostics] = await Promise.all([
        desktopApi.getDesktopConfig(),
        desktopApi.getDesktopDiagnostics(),
      ]);
      setForm(nextConfig);
      setDiagnostics(nextDiagnostics);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("desktop.loadError"));
    } finally {
      setLoading(false);
    }
  }, [desktopApi, t]);

  useEffect(() => {
    void loadDesktopState();
  }, [loadDesktopState]);

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (desktopApi === null || form === null) {
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const saved = await desktopApi.saveDesktopConfig(form);
      const nextDiagnostics = await desktopApi.getDesktopDiagnostics();
      setForm(saved);
      setDiagnostics(nextDiagnostics);
      setMessage(t("desktop.savedMessage"));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("desktop.loadError"));
    } finally {
      setSaving(false);
    }
  }

  async function onRefreshDiagnostics() {
    if (desktopApi === null) {
      return;
    }

    setError(null);
    setMessage(null);

    try {
      const healthy = await desktopApi.retryConnection();
      const nextDiagnostics = await desktopApi.getDesktopDiagnostics();
      setDiagnostics(nextDiagnostics);
      setMessage(healthy ? t("desktop.retryRecovered") : t("desktop.retryStillUnavailable"));
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : t("desktop.loadError"));
    }
  }

  async function onCopyDiagnostics() {
    if (desktopApi === null) {
      return;
    }

    setError(null);
    setMessage(null);

    try {
      await desktopApi.copyDesktopDiagnostics();
      setMessage(t("desktop.copySuccess"));
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : t("desktop.loadError"));
    }
  }

  async function onOpenLogs() {
    if (desktopApi === null) {
      return;
    }

    setError(null);
    setMessage(null);

    try {
      await desktopApi.openDesktopLogs();
      setMessage(t("desktop.openLogsSuccess"));
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : t("desktop.loadError"));
    }
  }

  async function onOpenWindow() {
    if (desktopApi === null) {
      return;
    }

    setError(null);
    setMessage(null);

    try {
      await desktopApi.openDesktopSettings();
      setMessage(t("desktop.openWindowSuccess"));
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : t("desktop.loadError"));
    }
  }

  function updateForm<K extends keyof DesktopSettings>(key: K, value: DesktopSettings[K]) {
    setForm((current) => (current === null ? current : { ...current, [key]: value }));
  }

  return (
    <AppShell>
      <StatusBanner />
      <div style={{ height: 20 }} />
      <PageFrame
        title={t("desktop.pageTitle")}
        description={t("desktop.pageDescription")}
      >
        {!desktopAvailable ? (
          <SettingsSection
            title={t("desktop.unavailableTitle")}
            description={t("desktop.unavailableBody")}
          >
            <InlineFeedback tone="info" title={t("desktop.unavailableTitle")}>
              {t("desktop.unavailableBody")}
            </InlineFeedback>
          </SettingsSection>
        ) : null}

        {desktopAvailable && loading ? (
          <SettingsSection
            title={t("desktop.pageTitle")}
            description={t("desktop.pageDescription")}
          >
            <p className="mm-muted">{t("common.working")}</p>
          </SettingsSection>
        ) : null}

        {desktopAvailable && !loading && form !== null && diagnostics !== null ? (
          <>
            <SettingsSection
              title={t("desktop.connectionTitle")}
              description={t("desktop.connectionDescription")}
            >
              <form className="mm-stack" style={{ gap: 16 }} onSubmit={onSave}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                    gap: 12,
                  }}
                >
                  <label className="mm-stack" style={{ gap: 6, fontSize: 13 }}>
                    <span>{t("desktop.appUrl")}</span>
                    <input
                      className="mm-input"
                      type="url"
                      value={form.appUrl}
                      onChange={(event) => updateForm("appUrl", event.target.value)}
                      disabled={saving}
                      required
                    />
                  </label>
                  <label className="mm-stack" style={{ gap: 6, fontSize: 13 }}>
                    <span>{t("desktop.healthUrl")}</span>
                    <input
                      className="mm-input"
                      type="url"
                      value={form.healthUrl}
                      onChange={(event) => updateForm("healthUrl", event.target.value)}
                      disabled={saving}
                      required
                    />
                  </label>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 10,
                  }}
                >
                  <label className="mm-row" style={{ alignItems: "center", gap: 8, fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={form.minimizeToTray}
                      onChange={(event) => updateForm("minimizeToTray", event.target.checked)}
                      disabled={saving}
                    />
                    <span>{t("desktop.minimizeToTray")}</span>
                  </label>
                  <label className="mm-row" style={{ alignItems: "center", gap: 8, fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={form.showWindowOnStartup}
                      onChange={(event) => updateForm("showWindowOnStartup", event.target.checked)}
                      disabled={saving}
                    />
                    <span>{t("desktop.showWindowOnStartup")}</span>
                  </label>
                  <label className="mm-row" style={{ alignItems: "center", gap: 8, fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={form.notificationsEnabled}
                      onChange={(event) => updateForm("notificationsEnabled", event.target.checked)}
                      disabled={saving}
                    />
                    <span>{t("desktop.notificationsEnabled")}</span>
                  </label>
                </div>

                <div className="mm-row" style={{ justifyContent: "flex-end", gap: 10 }}>
                  <Button onClick={() => void onRefreshDiagnostics()}>
                    {t("desktop.refreshDiagnostics")}
                  </Button>
                  <Button variant="primary" type="submit" disabled={saving}>
                    {saving ? t("desktop.saving") : t("desktop.save")}
                  </Button>
                </div>
              </form>
            </SettingsSection>

            <SettingsSection
              title={t("desktop.diagnosticsTitle")}
              description={t("desktop.diagnosticsDescription")}
            >
              <SettingRow
                label={t("desktop.connectionStatus")}
                value={connectionStatusLabel(t, diagnostics.connection.healthy)}
              />
              <SettingRow
                label={t("desktop.checkedAt")}
                value={diagnostics.connection.checkedAt ?? "-"}
              />
              <SettingRow
                label={t("desktop.source")}
                value={diagnostics.connection.source}
              />
              <SettingRow
                label={t("desktop.detail")}
                value={diagnostics.connection.detail}
              />
              <SettingRow
                label={t("desktop.logDirectory")}
                value={<span className="mm-mono">{diagnostics.logDirectory}</span>}
              />
              <SettingRow
                label={t("desktop.platform")}
                value={diagnostics.app.platform}
              />
              <SettingRow
                label={t("desktop.version")}
                value={diagnostics.app.version}
              />

              <div className="mm-row" style={{ justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
                <Button onClick={() => void onCopyDiagnostics()}>
                  {t("desktop.copyDiagnostics")}
                </Button>
                <Button onClick={() => void onOpenLogs()}>
                  {t("desktop.openLogs")}
                </Button>
                <Button onClick={() => void onOpenWindow()}>
                  {t("desktop.openWindow")}
                </Button>
              </div>
            </SettingsSection>
          </>
        ) : null}

        {error ? (
          <InlineFeedback tone="danger" title={t("mailboxes.actionError")}>
            {error}
          </InlineFeedback>
        ) : null}

        {message ? (
          <InlineFeedback tone="success" title={t("mailboxes.updated")}>
            {message}
          </InlineFeedback>
        ) : null}
      </PageFrame>
    </AppShell>
  );
}
