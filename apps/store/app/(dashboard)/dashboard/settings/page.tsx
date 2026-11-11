"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { LocationsManager } from "@/components/dashboard/locations-manager";
import { THEMES } from "@/lib/themes";
import { posMethodsFromSettings, type PosMethod } from "@/lib/payment-methods";
import { useSessionScope, useSettings, useUpdateSettings } from "@/lib/hooks";
import type { PaymentAccount, PaymentAccountsByMethod } from "@/lib/store-settings";
import { toast } from "sonner";
import { Save, RotateCcw, CreditCard, Receipt, Gift, Plus, X, Upload, Trash2, Check, Palette, Settings as SettingsIcon, MapPin, Percent } from "lucide-react";
import { TabStrip } from "@/components/dashboard/tab-strip";
import { SortableTable } from "@/components/dashboard/sortable-table";

const tabs = [
  { id: "General", icon: SettingsIcon },
  { id: "Locations", icon: MapPin },
  { id: "Taxes", icon: Percent },
  { id: "Payments", icon: CreditCard },
  { id: "Receipts", icon: Receipt },
  { id: "Loyalty", icon: Gift },
  { id: "Appearance", icon: Palette },
];

/** Downscale an oversized raster image so it fits Cloudinary's 10MB cap. */
async function shrinkImage(file: File, maxDim = 2048): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  bitmap.close();
  if (!blob || blob.size >= file.size) return file;
  return new File([blob], file.name.replace(/\.\w+$/, "") + ".png", { type: "image/png" });
}

export default function Settings() {
  const [tab, setTab] = useState("General");
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();

  return (
    <>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[220px_1fr]">
        <TabStrip
          variant="rail"
          tabs={tabs.map((t) => ({ key: t.id, label: t.id, icon: t.icon }))}
          active={tab}
          onChange={(k) => setTab(k)}
        />

        <Card className="p-5">
          {tab === "General" && (
            <GeneralTab settings={settings} onSave={updateSettings.mutateAsync} />
          )}
          {tab === "Locations" && (
            <div>
              <SectionHeader
                label="Locations"
                description="Warehouses and stores that stock, sell and transfer inventory."
              />
              <LocationsManager />
            </div>
          )}
          {tab === "Taxes" && <TaxesTab settings={settings} onSave={updateSettings.mutateAsync} />}
          {tab === "Payments" && (
            <div className="space-y-6">
              <section>
                <SectionHeader
                  label="Card acceptance"
                  description="Whether card payments are accepted and how they appear on receipts."
                />
                <PaymentsTab settings={settings} onSave={updateSettings.mutateAsync} />
              </section>
              <section>
                <SectionHeader
                  label="POS payment methods"
                  description="Methods the POS till offers at charge. Cash is always first."
                />
                <PosMethodsManager settings={settings} onSave={updateSettings.mutateAsync} />
              </section>
            </div>
          )}
          {tab === "Receipts" && (
            <ReceiptsTab settings={settings} onSave={updateSettings.mutateAsync} />
          )}
          {tab === "Loyalty" && (
            <LoyaltyTab settings={settings} onSave={updateSettings.mutateAsync} />
          )}
          {tab === "Appearance" && (
            <AppearanceTab settings={settings} onSave={updateSettings.mutateAsync} />
          )}
        </Card>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Shared section header — every settings panel opens with the same pattern
// ---------------------------------------------------------------------------

function SectionHeader({ label, description }: { label: string; description?: string }) {
  return (
    <div className="mb-4">
      <div className="text-sm font-medium">{label}</div>
      {description && <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared form component — reads/writes a section of the store_info object
// ---------------------------------------------------------------------------

function StoreInfoForm({
  section,
  fields,
  settings,
  onSave,
}: {
  section: string;
  fields: {
    key: string;
    label: string;
    type?: string;
    placeholder?: string;
    options?: string[];
    fullWidth?: boolean;
  }[];
  settings?: Record<string, any>;
  onSave: (data: Record<string, any>) => Promise<any>;
}) {
  // settings has shape { store_info: { name, email, ... }, ... }
  const storeInfo = (settings?.store_info ?? {}) as Record<string, any>;
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const initial: Record<string, any> = {};
    for (const f of fields) {
      initial[f.key] = storeInfo[f.key] ?? "";
    }
    setForm(initial);
  }, [settings, fields]);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Merge form into existing store_info so other tabs aren't overwritten
      const merged = { ...storeInfo, ...form };
      await onSave({ store_info: merged });
      toast.success(`${section} settings saved`);
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    const initial: Record<string, any> = {};
    for (const f of fields) {
      initial[f.key] = storeInfo[f.key] ?? "";
    }
    setForm(initial);
  };

  return (
    <div>
      <SectionHeader label={section} />
      <div className="grid gap-4 md:grid-cols-2">
        {fields.map((f) => (
          <label
            key={f.key}
            className={"grid gap-1 text-sm" + (f.fullWidth ? " md:col-span-2" : "")}
          >
            <span className="text-xs text-muted-foreground">{f.label}</span>
            {f.type === "select" && f.options ? (
              <select
                value={form[f.key] ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                className="rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
              >
                {f.options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : f.type === "toggle" ? (
              <Switch
                checked={Boolean(form[f.key])}
                onCheckedChange={(v) => setForm((prev) => ({ ...prev, [f.key]: v }))}
              />
            ) : f.type === "logo" ? (
              <div className="flex flex-wrap items-center gap-2">
                {form[f.key] ? (
                  <div className="flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={form[f.key]}
                      alt="Store logo"
                      className="h-10 w-10 rounded border border-border bg-background object-contain"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setForm((prev) => ({ ...prev, [f.key]: "" }))}
                    >
                      <Trash2 size={13} /> Remove
                    </Button>
                  </div>
                ) : null}
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploading}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setUploading(true);
                    try {
                      // Cloudinary rejects images over 10MB — shrink oversized
                      // rasters client-side instead of failing the upload.
                      let uploadFile = file;
                      if (uploadFile.size > 10 * 1024 * 1024 && !uploadFile.type.includes("svg")) {
                        uploadFile = await shrinkImage(uploadFile);
                      }
                      const fd = new FormData();
                      fd.append("file", uploadFile);
                      fd.append("folder", "logos");
                      const res = await fetch("/api/dashboard/upload", {
                        method: "POST",
                        body: fd,
                      });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data.error || "Upload failed");
                      setForm((prev) => ({ ...prev, [f.key]: data.url }));
                      toast.success("Logo uploaded");
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Logo upload failed");
                    } finally {
                      setUploading(false);
                    }
                  }}
                  className="text-xs text-muted-foreground file:mr-2 file:rounded file:border file:border-border file:bg-surface file:px-2 file:py-1 file:text-xs"
                />
              </div>
            ) : f.type === "textarea" ? (
              <Textarea
                value={form[f.key] ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                rows={8}
              />
            ) : (
              <Input
                type={f.type || "text"}
                value={form[f.key] ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
              />
            )}
          </label>
        ))}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={handleReset}>
          <RotateCcw size={13} /> Reset
        </Button>
        <Button variant="default" size="sm" onClick={() => void handleSave()} disabled={saving}>
          <Save size={13} /> {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

function GeneralTab({
  settings,
  onSave,
}: {
  settings?: Record<string, any>;
  onSave: (data: Record<string, any>) => Promise<any>;
}) {
  return (
    <StoreInfoForm
      section="General"
      settings={settings}
      onSave={onSave}
      fields={[
        { key: "name", label: "Business name", placeholder: "Your shop name" },
        { key: "tagline", label: "Tagline", placeholder: "Your one-stop phone shop" },
        { key: "email", label: "Contact email", type: "email", placeholder: "hello@store.com" },
        { key: "phone", label: "Support phone", placeholder: "+880 1XXX-XXXXXX" },
        { key: "address", label: "Business address", placeholder: "Dhaka, Bangladesh" },
        { key: "website", label: "Web address", placeholder: "https://yourstore.com" },
        { key: "logo", label: "Shop logo", type: "logo" },
        {
          key: "currency",
          label: "Currency",
          type: "select",
          options: ["BDT", "USD", "EUR", "GBP", "INR"],
        },
      ]}
    />
  );
}

function TaxesTab({
  settings,
  onSave,
}: {
  settings?: Record<string, any>;
  onSave: (data: Record<string, any>) => Promise<any>;
}) {
  return (
    <div>
      <StoreInfoForm
        section="Taxes"
        settings={settings}
        onSave={onSave}
        fields={[
          { key: "taxRate", label: "Default tax rate (%)", type: "number", placeholder: "15" },
          { key: "taxRegNumber", label: "Tax registration number" },
          { key: "vatInclusive", label: "VAT inclusive pricing", type: "toggle" },
        ]}
      />
      <p className="mt-4 text-xs text-muted-foreground">
        Tax overrides can be set per product and per location. VAT inclusive pricing includes tax in
        the displayed price.
      </p>
    </div>
  );
}

type AccountFieldKey = "name" | "number" | "bank";
type AccountField = {
  key: AccountFieldKey;
  label: string;
  placeholder?: string;
  required?: boolean;
};

const ACCOUNT_FIELD_SETS: Record<string, AccountField[]> = {
  bkash: [
    { key: "name", label: "Label", placeholder: "e.g. bKash Personal" },
    { key: "number", label: "bKash number", placeholder: "01XXXXXXXXX", required: true },
  ],
  nagad: [
    { key: "name", label: "Label", placeholder: "e.g. Nagad Main" },
    { key: "number", label: "Nagad number", placeholder: "01XXXXXXXXX", required: true },
  ],
  card: [
    { key: "name", label: "Terminal name", placeholder: "e.g. POS Terminal 1", required: true },
    { key: "bank", label: "Bank name", placeholder: "e.g. City Bank", required: true },
    { key: "number", label: "Terminal ID", placeholder: "Optional terminal ref" },
  ],
  bank: [
    { key: "name", label: "Account name", placeholder: "e.g. Business A/C", required: true },
    { key: "bank", label: "Bank name", placeholder: "e.g. Dutch-Bangla Bank", required: true },
    { key: "number", label: "Account number", placeholder: "e.g. 123-456-789", required: true },
  ],
};

function AccountGroupEditor({
  title,
  accounts,
  fields,
  onChange,
}: {
  title: string;
  accounts: PaymentAccount[];
  fields: AccountField[];
  onChange: (next: PaymentAccount[]) => void;
}) {
  const [draft, setDraft] = useState<Record<AccountFieldKey, string>>({
    name: "",
    number: "",
    bank: "",
  });
  const [adding, setAdding] = useState(false);

  const canAdd = fields.filter((f) => f.required).every((f) => draft[f.key].trim().length > 0);

  const addAccount = () => {
    if (!canAdd) return;
    onChange([
      ...accounts,
      {
        id: crypto.randomUUID(),
        name: draft.name.trim(),
        number: draft.number.trim(),
        bank: draft.bank.trim(),
        isDefault: accounts.length === 0,
      },
    ]);
    setDraft({ name: "", number: "", bank: "" });
    setAdding(false);
  };

  const setDefault = (id: string) =>
    onChange(accounts.map((a) => ({ ...a, isDefault: a.id === id })));

  const remove = (id: string) => {
    const next = accounts.filter((a) => a.id !== id);
    if (next.length > 0 && !next.some((a) => a.isDefault)) next[0].isDefault = true;
    onChange(next);
  };

  const updateField = (id: string, key: AccountFieldKey, value: string) =>
    onChange(accounts.map((a) => (a.id === id ? { ...a, [key]: value } : a)));

  return (
    <div className="mt-5">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-medium">{title}</div>
        {!adding && (
          <Button variant="surface" size="sm" onClick={() => setAdding(true)}>
            <Plus size={13} /> Add
          </Button>
        )}
      </div>

      {adding && (
        <div className="mb-3 grid gap-2 rounded border border-border bg-surface/50 p-3 sm:grid-cols-3">
          {fields.map((f) => (
            <label key={f.key} className="grid gap-1 text-sm">
              <span className="text-xs text-muted-foreground">{f.label}</span>
              <input
                value={draft[f.key]}
                onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                className="rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
              />
            </label>
          ))}
          <div className="flex items-end gap-2 sm:col-span-3">
            <Button variant="default" size="sm" onClick={addAccount} disabled={!canAdd}>
              Add account
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {accounts.length === 0 && !adding ? (
        <div className="rounded border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          No {title.toLowerCase()} accounts configured yet.
        </div>
      ) : (
        <SortableTable
          columns={[
            ...fields.map((f) => ({
              key: f.key,
              header: f.label,
              sortable: true,
              render: (value: string, a: PaymentAccount) => (
                <input
                  value={a[f.key] ?? ""}
                  onChange={(e) => updateField(a.id, f.key, e.target.value)}
                  className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
                />
              ),
            })),
            {
              key: "isDefault",
              header: "Default",
              render: (value: boolean, a: PaymentAccount) => (
                <button
                  type="button"
                  onClick={() => setDefault(a.id)}
                  className={
                    value
                      ? "font-medium text-emerald-600"
                      : "text-muted-foreground hover:text-foreground"
                  }
                >
                  {value ? "✓ Default" : "Set default"}
                </button>
              ),
            },
            {
              key: "actions",
              header: "",
              className: "text-right",
              render: (_v: any, a: PaymentAccount) => (
                <button
                  type="button"
                  onClick={() => remove(a.id)}
                  className="text-muted-foreground hover:text-sale"
                  aria-label="Remove account"
                >
                  <X size={14} />
                </button>
              ),
            },
          ]}
          data={accounts.map((a) => ({ ...a }))}
          rowKey={(a) => a.id}
          emptyMessage={`No ${title.toLowerCase()} accounts configured yet.`}
        />
      )}
    </div>
  );
}

function PaymentsTab({
  settings,
  onSave,
}: {
  settings?: Record<string, any>;
  onSave: (data: Record<string, any>) => Promise<any>;
}) {
  const storeInfo = (settings?.store_info ?? {}) as Record<string, any>;
  const [toggles, setToggles] = useState({
    acceptCash: (storeInfo.acceptCash ?? true) as boolean,
    acceptCard: (storeInfo.acceptCard ?? false) as boolean,
    acceptMobile: (storeInfo.acceptMobile ?? false) as boolean,
  });
  const [accounts, setAccounts] = useState<PaymentAccountsByMethod>(
    (storeInfo.paymentAccounts as PaymentAccountsByMethod) ?? {
      bkash: [],
      nagad: [],
      card: [],
      bank: [],
    },
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setToggles({
      acceptCash: (storeInfo.acceptCash ?? true) as boolean,
      acceptCard: (storeInfo.acceptCard ?? false) as boolean,
      acceptMobile: (storeInfo.acceptMobile ?? false) as boolean,
    });
    setAccounts(
      (storeInfo.paymentAccounts as PaymentAccountsByMethod) ?? {
        bkash: [],
        nagad: [],
        card: [],
        bank: [],
      },
    );
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const merged = {
        ...storeInfo,
        ...toggles,
        paymentAccounts: accounts,
      };
      await onSave({ store_info: merged });
      toast.success("Payment settings saved");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const Toggle = ({
    label,
    checked,
    onChange,
  }: {
    label: string;
    checked: boolean;
    onChange: (v: boolean) => void;
  }) => (
    <div className="flex items-center gap-2 text-sm">
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={
          "flex h-6 w-11 items-center rounded-full transition-colors " +
          (checked ? "bg-primary" : "bg-border")
        }
      >
        <span
          className={
            "h-4 w-4 rounded-full bg-background transition-transform " +
            (checked ? "translate-x-6" : "translate-x-1")
          }
        />
      </button>
      <span className="text-muted-foreground">{label}</span>
    </div>
  );

  return (
    <div>
      <div className="mb-1 text-sm font-medium">Payments</div>
      <p className="mb-3 text-xs text-muted-foreground">
        Enable methods and configure the account, terminal, or number used for each. One account per
        method is marked as default — the one used at checkout.
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <Toggle
          label="Accept cash payments"
          checked={toggles.acceptCash}
          onChange={(v) => setToggles((t) => ({ ...t, acceptCash: v }))}
        />
        <Toggle
          label="Accept card payments"
          checked={toggles.acceptCard}
          onChange={(v) => setToggles((t) => ({ ...t, acceptCard: v }))}
        />
        <Toggle
          label="Accept mobile payments"
          checked={toggles.acceptMobile}
          onChange={(v) => setToggles((t) => ({ ...t, acceptMobile: v }))}
        />
      </div>

      <AccountGroupEditor
        title="bKash"
        accounts={accounts.bkash}
        fields={ACCOUNT_FIELD_SETS.bkash}
        onChange={(next) => setAccounts((a) => ({ ...a, bkash: next }))}
      />
      <AccountGroupEditor
        title="Nagad"
        accounts={accounts.nagad}
        fields={ACCOUNT_FIELD_SETS.nagad}
        onChange={(next) => setAccounts((a) => ({ ...a, nagad: next }))}
      />
      <AccountGroupEditor
        title="Card (terminals)"
        accounts={accounts.card}
        fields={ACCOUNT_FIELD_SETS.card}
        onChange={(next) => setAccounts((a) => ({ ...a, card: next }))}
      />
      <AccountGroupEditor
        title="Bank accounts"
        accounts={accounts.bank}
        fields={ACCOUNT_FIELD_SETS.bank}
        onChange={(next) => setAccounts((a) => ({ ...a, bank: next }))}
      />

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="default" size="sm" onClick={() => void handleSave()} disabled={saving}>
          <Save size={13} /> {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

function ReceiptsTab({
  settings,
  onSave,
}: {
  settings?: Record<string, any>;
  onSave: (data: Record<string, any>) => Promise<any>;
}) {
  return (
    <StoreInfoForm
      section="Receipts"
      settings={settings}
      onSave={onSave}
      fields={[
        {
          key: "receiptHeader",
          label: "Receipt header text",
          placeholder: "Thank you for shopping!",
        },
        {
          key: "receiptFooter",
          label: "Receipt footer text",
          placeholder: "Returns accepted within 7 days",
        },
        { key: "showLogo", label: "Show logo on receipt", type: "toggle" },
        { key: "showTaxBreakdown", label: "Show tax breakdown", type: "toggle" },
        { key: "receiptCopies", label: "Default print copies", type: "number", placeholder: "1" },
        {
          key: "receiptPolicies",
          label: "Terms & conditions (one item per line)",
          type: "textarea",
          fullWidth: true,
        },
      ]}
    />
  );
}

function LoyaltyTab({
  settings,
  onSave,
}: {
  settings?: Record<string, any>;
  onSave: (data: Record<string, any>) => Promise<any>;
}) {
  return (
    <StoreInfoForm
      section="Loyalty"
      settings={settings}
      onSave={onSave}
      fields={[
        { key: "loyaltyEnabled", label: "Enable loyalty program", type: "toggle" },
        {
          key: "pointsPer100BDT",
          label: "Points per 100 BDT spent",
          type: "number",
          placeholder: "1",
        },
        {
          key: "redemptionRate",
          label: "Points redemption rate (1 point = ? BDT)",
          type: "number",
          placeholder: "0.10",
        },
        {
          key: "minRedemption",
          label: "Minimum points to redeem",
          type: "number",
          placeholder: "100",
        },
        { key: "welcomeBonus", label: "Welcome bonus points", type: "number", placeholder: "50" },
      ]}
    />
  );
}

// ---------------------------------------------------------------------------
// Appearance — per-shop theme picker (applies instantly via the layout)
// ---------------------------------------------------------------------------

function AppearanceTab({
  settings,
  onSave,
}: {
  settings?: Record<string, any>;
  onSave: (data: Record<string, any>) => Promise<any>;
}) {
  const current = (settings?.appearance_theme as string) || "axiom-teal";
  const [picked, setPicked] = useState(current);
  const [saving, setSaving] = useState(false);
  const dirty = picked !== current;

  const save = async () => {
    setSaving(true);
    try {
      await onSave({ appearance_theme: picked === "axiom-teal" ? "" : picked });
      // Full reload so the layout's server-read theme class applies everywhere.
      window.location.reload();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="text-sm font-medium">Appearance</div>
      <p className="mt-1 text-xs text-muted-foreground">
        Pick the color theme for this shop. Applies to every signed-in user within a few seconds.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {THEMES.map((t) => (
          <button
            key={t.id}
            onClick={() => setPicked(t.id)}
            className={
              "border p-3 text-left text-xs transition-colors " +
              (picked === t.id ? "border-primary bg-primary/5" : "border-border hover:bg-surface")
            }
          >
            <div className="flex items-center gap-1.5 font-semibold">
              {picked === t.id && <Check size={12} className="text-primary" />}
              {t.name}
              {t.dark && (
                <span className="ml-auto rounded-sm bg-muted px-1 text-[9px] uppercase tracking-wide text-muted-foreground">
                  dark
                </span>
              )}
            </div>
            <div className="mt-2 flex gap-1">
              {[t.vars["--primary"], t.vars["--accent"] ?? t.vars["--surface"], t.vars["--highlight"] ?? t.vars["--card"] ?? "#64748b"].map(
                (c, i) => (
                  <span
                    key={i}
                    className="inline-block h-4 w-4 border border-border"
                    style={{ background: c }}
                  />
                ),
              )}
            </div>
          </button>
        ))}
      </div>
      <button
        onClick={() => void save()}
        disabled={!dirty || saving}
        className="mt-4 bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {saving ? "Applying…" : "Apply theme"}
      </button>
      <p className="mt-2 text-xs text-muted-foreground">
        Applying reloads the app so every page picks up the theme.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// POS payment methods — owner-managed; consumed by the POS charge panel
// ---------------------------------------------------------------------------

function PosMethodsManager({
  settings,
  onSave,
}: {
  settings?: Record<string, any>;
  onSave: (data: Record<string, any>) => Promise<any>;
}) {
  const { data: session } = useSessionScope();
  const isOwner = session?.role === "owner";
  const [methods, setMethods] = useState<PosMethod[]>(() => posMethodsFromSettings(settings?.pos_methods));
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setMethods(posMethodsFromSettings(settings?.pos_methods));
    setDirty(false);
  }, [settings]);

  const commit = async (next: PosMethod[]) => {
    setSaving(true);
    try {
      await onSave({ pos_methods: next });
      setMethods(next);
      setDirty(false);
      toast.success("Payment methods updated");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const patch = (next: PosMethod[]) => {
    setMethods(next);
    setDirty(true);
  };

  const add = () => {
    const name = newName.trim();
    if (!name) return;
    if (methods.some((m) => m.name.toLowerCase() === name.toLowerCase())) {
      toast.error("A method with this name already exists");
      return;
    }
    patch([...methods, { id: crypto.randomUUID(), name, active: true }]);
    setNewName("");
  };

  return (
    <div className="mt-6 border-t border-border pt-5">
      <div className="text-sm font-medium">POS payment methods</div>
      <p className="mt-1 text-xs text-muted-foreground">
        The methods cashiers see on the POS charge panel. Cash is pinned and always shown first.
        {isOwner ? "" : " Only the shop owner can change these."}
      </p>
      <div className="mt-3 space-y-1.5">
        {methods.map((m, idx) => (
          <div key={m.id} className="flex items-center gap-2">
            <input
              value={m.name}
              onChange={(e) =>
                isOwner &&
                patch(methods.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)))
              }
              disabled={!isOwner || m.id === "cash"}
              className="rounded-md h-8 w-40 border border-border px-2 text-sm outline-none focus:border-primary disabled:opacity-60"
            />
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={m.active}
                onChange={(e) => isOwner && patch(methods.map((x, i) => (i === idx ? { ...x, active: e.target.checked } : x)))}
                disabled={!isOwner}
              />
              active
            </label>
            {m.id !== "cash" && isOwner && (
              <button
                onClick={() => patch(methods.filter((_, i) => i !== idx))}
                className="text-muted-foreground hover:text-destructive"
                aria-label={`Remove ${m.name}`}
              >
                <Trash2 size={13} />
              </button>
            )}
            {m.id === "cash" && <span className="text-[10px] text-muted-foreground">pinned</span>}
          </div>
        ))}
      </div>
      {isOwner && (
        <div className="mt-3 flex items-center gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="New method name (e.g. Rocket)"
            className="rounded-md h-8 w-52 border border-border px-2 text-sm outline-none focus:border-primary"
          />
          <button onClick={add} className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-surface">
            Add
          </button>
          {dirty && (
            <button
              onClick={() => void commit(methods)}
              disabled={saving}
              className="ml-auto bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save methods"}
            </button>
          )}
        </div>
      )}
      {!isOwner && (
        <p className="mt-2 text-xs text-muted-foreground">Sign in as the shop owner to edit payment methods.</p>
      )}
    </div>
  );
}
