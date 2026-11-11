"use client";

import { useEffect, useState } from "react";
import { PortalShell } from "@/components/portal/portal-shell";
import { Card, Pill } from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import { useAddresses } from "@/lib/hooks";
import { MapPin, Pencil, Trash2 } from "lucide-react";

export interface Address {
  id: string;
  userId: string;
  label: string;
  fullName: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone: string;
  isDefault: boolean;
}

export default function Addresses() {
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    setUserId(localStorage.getItem("userId"));
  }, []);
  const { data: initialAddresses = [] } = useAddresses(userId ?? undefined);
  const [addrs, setAddrs] = useState<Address[]>([]);
  useEffect(() => {
    setAddrs(initialAddresses);
  }, [initialAddresses]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const setDefault = (id: string) => {
    setAddrs((prev) => prev.map((a) => ({ ...a, isDefault: a.id === id })));
  };

  const remove = (id: string) => {
    setAddrs((prev) => {
      const next = prev.filter((a) => a.id !== id);
      if (prev.find((a) => a.id === id)?.isDefault && next.length > 0) next[0].isDefault = true;
      return next;
    });
  };

  const saveEdit = (updated: Address) => {
    setAddrs((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    setEditingId(null);
  };

  return (
    <PortalShell title="Addresses">
      <div className="mb-4 flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {addrs.length} saved {addrs.length === 1 ? "address" : "addresses"}
        </div>
        <Button
          variant="surface"
          onClick={() => {
            setShowForm(true);
            setEditingId("new");
          }}
        >
          <MapPin size={13} /> Add Address
        </Button>
      </div>

      {addrs.length === 0 && !showForm ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No saved addresses. Add one to get started.
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {addrs.map((a) => (
            <AddressCard
              key={a.id}
              addr={a}
              isEditing={editingId === a.id}
              onEdit={() => setEditingId(a.id)}
              onCancel={() => setEditingId(null)}
              onSave={saveEdit}
              onSetDefault={() => setDefault(a.id)}
              onDelete={() => remove(a.id)}
            />
          ))}
          {showForm && editingId === "new" && (
            <AddressForm
              onSave={(addr) => {
                setAddrs((prev) => [...prev, { ...addr, id: `addr-${Date.now()}` }]);
                setShowForm(false);
                setEditingId(null);
              }}
              onCancel={() => {
                setShowForm(false);
                setEditingId(null);
              }}
            />
          )}
        </div>
      )}
    </PortalShell>
  );
}

function AddressCard({
  addr,
  isEditing,
  onEdit,
  onCancel,
  onSave,
  onSetDefault,
  onDelete,
}: {
  addr: Address;
  isEditing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (a: Address) => void;
  onSetDefault: () => void;
  onDelete: () => void;
}) {
  if (isEditing) {
    return <AddressForm addr={addr} onSave={onSave} onCancel={onCancel} />;
  }

  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{addr.label}</span>
          {addr.isDefault && <Pill tone="success">Default</Pill>}
        </div>
        <div className="flex gap-1">
          <button onClick={onEdit} className="p-1 text-muted-foreground hover:text-foreground">
            <Pencil size={13} />
          </button>
          <button onClick={onDelete} className="p-1 text-muted-foreground hover:text-sale">
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      <div className="text-sm leading-relaxed text-muted-foreground">
        <div className="font-medium text-foreground">{addr.fullName}</div>
        <div>{addr.street}</div>
        <div>
          {addr.city}, {addr.state} {addr.zip}
        </div>
        <div>{addr.phone}</div>
      </div>
      {!addr.isDefault && (
        <button onClick={onSetDefault} className="mt-2 text-xs text-primary hover:underline">
          Set as default
        </button>
      )}
    </Card>
  );
}

function AddressForm({
  addr,
  onSave,
  onCancel,
}: {
  addr?: Address;
  onSave: (a: Address) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<Address>(
    addr ?? {
      id: "",
      userId: "",
      label: "",
      fullName: "",
      street: "",
      city: "",
      state: "",
      zip: "",
      country: "United States",
      phone: "",
      isDefault: false,
    },
  );

  function f(label: string, value: string, onChange: (v: string) => void) {
    return (
      <div>
        <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
          {label}
        </label>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-md w-full border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-foreground"
        />
      </div>
    );
  }

  return (
    <Card className="p-4 md:col-span-2">
      <div className="mb-3 text-sm font-medium">{addr ? "Edit Address" : "Add Address"}</div>
      <div className="grid gap-3 md:grid-cols-2">
        {f("Label", form.label, (v) => setForm((p) => ({ ...p, label: v })))}
        {f("Full Name", form.fullName, (v) => setForm((p) => ({ ...p, fullName: v })))}
        {f("Street", form.street, (v) => setForm((p) => ({ ...p, street: v })))}
        {f("City", form.city, (v) => setForm((p) => ({ ...p, city: v })))}
        {f("State", form.state, (v) => setForm((p) => ({ ...p, state: v })))}
        {f("ZIP Code", form.zip, (v) => setForm((p) => ({ ...p, zip: v })))}
        {f("Country", form.country, (v) => setForm((p) => ({ ...p, country: v })))}
        {f("Phone", form.phone, (v) => setForm((p) => ({ ...p, phone: v })))}
      </div>
      <div className="mt-3 flex gap-2">
        <Button onClick={() => onSave(form)} variant="default">
          Save
        </Button>
        <Button onClick={onCancel} variant="surface">
          Cancel
        </Button>
      </div>
    </Card>
  );
}
