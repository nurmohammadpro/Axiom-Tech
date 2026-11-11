"use client";

import { useEffect, useState } from "react";
import { PortalShell } from "@/components/portal/portal-shell";
import { Card } from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import { useProfile } from "@/lib/hooks";

export default function Settings() {
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    setUserId(localStorage.getItem("userId"));
  }, []);
  const { data: user } = useProfile(userId ?? undefined);
  const [profile, setProfile] = useState({ firstName: "", lastName: "", email: "", phone: "" });
  useEffect(() => {
    if (user)
      setProfile({
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone ?? "",
      });
  }, [user]);
  const [password, setPassword] = useState({ current: "", newPw: "", confirm: "" });
  const [saved, setSaved] = useState(false);
  const [pwSaved, setPwSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handlePwSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.current || !password.newPw || password.newPw !== password.confirm) return;
    setPwSaved(true);
    setPassword({ current: "", newPw: "", confirm: "" });
    setTimeout(() => setPwSaved(false), 2500);
  };

  function field(label: string, value: string, onChange: (v: string) => void) {
    return (
      <div>
        <label className="mb-1 block text-xs uppercase tracking-widest text-foreground/70 font-medium">
          {label}
        </label>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-md w-full border border-border bg-background px-3 py-1.5 text-sm outline-none transition-colors hover:border-border/80 focus:border-foreground/80"
        />
      </div>
    );
  }

  return (
    <PortalShell title="Settings">
      <Card className="mb-4 p-4">
        <div className="mb-4 text-sm font-medium">Profile</div>
        <form onSubmit={handleSave} className="grid gap-3 md:grid-cols-2">
          {field("First Name", profile.firstName, (v) =>
            setProfile((p) => ({ ...p, firstName: v })),
          )}
          {field("Last Name", profile.lastName, (v) => setProfile((p) => ({ ...p, lastName: v })))}
          {field("Email", profile.email, (v) => setProfile((p) => ({ ...p, email: v })))}
          {field("Phone", profile.phone, (v) => setProfile((p) => ({ ...p, phone: v })))}
          <div className="md:col-span-2 flex items-center gap-3">
            <Button type="submit" variant="default">
              Save Changes
            </Button>
            {saved && <span className="text-xs text-emerald-600">Saved.</span>}
          </div>
        </form>
      </Card>

      <Card className="p-4">
        <div className="mb-4 text-sm font-medium">Change Password</div>
        <form onSubmit={handlePwSave} className="grid gap-3 md:grid-cols-2">
          {field("Current Password", password.current, (v) =>
            setPassword((p) => ({ ...p, current: v })),
          )}
          {field("New Password", password.newPw, (v) => setPassword((p) => ({ ...p, newPw: v })))}
          {field("Confirm New Password", password.confirm, (v) =>
            setPassword((p) => ({ ...p, confirm: v })),
          )}
          <div className="md:col-span-2 flex items-center gap-3">
            <Button type="submit" variant="default">
              Update Password
            </Button>
            {pwSaved && <span className="text-xs text-emerald-600">Password updated.</span>}
          </div>
        </form>
      </Card>
    </PortalShell>
  );
}
