"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, Pill, Stat, Table } from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLocations, useStaff, useSessionScope } from "@/lib/hooks";
import {
  createStaff,
  updateStaff,
  grantStaffAccess,
  revokeStaffAccess,
  type StaffEducation,
  type StaffExperience,
  type StaffInput,
} from "@/lib/api";
import { toast } from "sonner";
import { Plus, X, Pencil, Shield, ShieldOff, Trash2 } from "lucide-react";
import { LeavesView } from "../hr/leaves/page";
import { PayrollView } from "../hr/payroll/page";
import { HrSetupView } from "../hr/setup/page";

const inputCls =
  "w-full border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-foreground";

const SECTIONS = ["personal", "employment", "education", "experience", "access"] as const;
type Section = (typeof SECTIONS)[number];

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: string;
  storeLocation: string;
  isActive: boolean;
  phone: string;
  personalEmail: string;
  dateOfBirth: string;
  gender: string;
  address: string;
  city: string;
  nidNumber: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  designation: string;
  department: string;
  joinedAt: string;
  employmentType: string;
  employeeCode: string;
  monthlySalary: string;
  basicSalary: string;
  housingAllowance: string;
  transportAllowance: string;
  medicalAllowance: string;
  otherAllowance: string;
  providentFundRate: string;
  salaryEffectiveFrom: string;
  education: StaffEducation[];
  experience: StaffExperience[];
}

const emptyForm = (): FormState => ({
  firstName: "",
  lastName: "",
  email: "",
  password: "",
  role: "salesman",
  storeLocation: "",
  isActive: true,
  phone: "",
  personalEmail: "",
  dateOfBirth: "",
  gender: "",
  address: "",
  city: "",
  nidNumber: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  designation: "",
  department: "",
  joinedAt: "",
  employmentType: "full_time",
  employeeCode: "",
  monthlySalary: "",
  basicSalary: "",
  housingAllowance: "",
  transportAllowance: "",
  medicalAllowance: "",
  otherAllowance: "",
  providentFundRate: "",
  salaryEffectiveFrom: "",
  education: [],
  experience: [],
});

export default function Staff() {
  const qc = useQueryClient();
  const { data: team = [] } = useStaff();
  const { data: locations = [] } = useLocations();
  const { data: me } = useSessionScope();
  const userRole = me?.role || me?.staffRole || "";
  const isOwner = userRole === "owner";

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("personal");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [accessPw, setAccessPw] = useState("");
  const [accessRole, setAccessRole] = useState("salesman");
  const [tab, setTab] = useState<"team" | "leave" | "payroll" | "setup">("team");

  const editing = team.find((s) => s.id === editId) ?? null;
  const activeCount = team.filter((s) => s.isActive).length;
  const withAccess = team.filter((s) => s.hasAccess).length;
  const roles = [...new Set(team.map((s) => s.role))];

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  function buildProfile(): StaffInput {
    return {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim() || undefined,
      role: form.role,
      storeLocation: form.storeLocation,
      isActive: form.isActive,
      phone: form.phone || undefined,
      personalEmail: form.personalEmail || undefined,
      dateOfBirth: form.dateOfBirth || undefined,
      gender: form.gender || undefined,
      address: form.address || undefined,
      city: form.city || undefined,
      nidNumber: form.nidNumber || undefined,
      emergencyContactName: form.emergencyContactName || undefined,
      emergencyContactPhone: form.emergencyContactPhone || undefined,
      designation: form.designation || undefined,
      department: form.department || undefined,
      joinedAt: form.joinedAt || undefined,
      employmentType: form.employmentType,
      employeeCode: form.employeeCode || undefined,
      monthlySalary: form.monthlySalary === "" ? null : Number(form.monthlySalary),
      basicSalary: form.basicSalary === "" ? null : Number(form.basicSalary),
      housingAllowance: form.housingAllowance === "" ? 0 : Number(form.housingAllowance),
      transportAllowance: form.transportAllowance === "" ? 0 : Number(form.transportAllowance),
      medicalAllowance: form.medicalAllowance === "" ? 0 : Number(form.medicalAllowance),
      otherAllowance: form.otherAllowance === "" ? 0 : Number(form.otherAllowance),
      providentFundRate: form.providentFundRate === "" ? 0 : Number(form.providentFundRate),
      salaryEffectiveFrom: form.salaryEffectiveFrom || undefined,
      education: form.education.filter((e) => e.degree || e.institution),
      experience: form.experience.filter((e) => e.company || e.role),
    };
  }

  async function onSubmit() {
    if (!form.firstName.trim()) {
      toast.error("First name is required");
      return;
    }
    if (!form.storeLocation) {
      toast.error("Assign the staff member to a warehouse");
      return;
    }
    if (!editId && form.password && !form.email) {
      toast.error("Enter an email to grant system access, or leave password blank");
      return;
    }
    setBusy(true);
    try {
      if (editId) {
        await updateStaff(editId, buildProfile());
        toast.success(`${form.firstName.trim()} updated`);
      } else {
        await createStaff({
          ...buildProfile(),
          email: form.email.trim() || undefined,
          password: form.password || undefined,
        });
        toast.success(
          form.email && form.password
            ? `${form.firstName.trim()} added with system access`
            : `${form.firstName.trim()} added (no system access)`,
        );
      }
      closeForm();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Operation failed");
    } finally {
      setBusy(false);
    }
  }

  async function onGrantAccess() {
    if (!editing) return;
    if (!form.email.trim() || !accessPw) {
      toast.error("Email and password are required to grant access");
      return;
    }
    setBusy(true);
    try {
      await grantStaffAccess(editing.id, {
        email: form.email.trim(),
        password: accessPw,
        role: accessRole,
      });
      toast.success("System access granted");
      setAccessPw("");
      void qc.invalidateQueries({ queryKey: ["dashboard", "staff"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to grant access");
    } finally {
      setBusy(false);
    }
  }

  async function onRevokeAccess() {
    if (!editing) return;
    setBusy(true);
    try {
      await revokeStaffAccess(editing.id);
      toast.success("System access revoked");
      void qc.invalidateQueries({ queryKey: ["dashboard", "staff"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to revoke access");
    } finally {
      setBusy(false);
    }
  }

  function openEdit(member: (typeof team)[number]) {
    setEditId(member.id);
    setSection("personal");
    setAccessPw("");
    setAccessRole(member.role === "staff" ? "salesman" : member.role);
    setForm({
      firstName: member.firstName ?? "",
      lastName: member.lastName ?? "",
      email: member.email ?? "",
      password: "",
      role: member.role,
      storeLocation: member.storeLocation ?? "",
      isActive: member.isActive,
      phone: member.phone ?? "",
      personalEmail: member.personalEmail ?? "",
      dateOfBirth: member.dateOfBirth ?? "",
      gender: member.gender ?? "",
      address: member.address ?? "",
      city: member.city ?? "",
      nidNumber: member.nidNumber ?? "",
      emergencyContactName: member.emergencyContactName ?? "",
      emergencyContactPhone: member.emergencyContactPhone ?? "",
      designation: member.designation ?? "",
      department: member.department ?? "",
      joinedAt: member.joinedAt ?? "",
      employmentType: member.employmentType ?? "full_time",
      employeeCode: member.employeeCode ?? "",
      monthlySalary: member.monthlySalary != null ? String(member.monthlySalary) : "",
      basicSalary: member.basicSalary != null ? String(member.basicSalary) : "",
      housingAllowance: member.housingAllowance != null ? String(member.housingAllowance) : "",
      transportAllowance:
        member.transportAllowance != null ? String(member.transportAllowance) : "",
      medicalAllowance: member.medicalAllowance != null ? String(member.medicalAllowance) : "",
      otherAllowance: member.otherAllowance != null ? String(member.otherAllowance) : "",
      providentFundRate: member.providentFundRate != null ? String(member.providentFundRate) : "",
      salaryEffectiveFrom: member.salaryEffectiveFrom ?? "",
      education: member.education ?? [],
      experience: member.experience ?? [],
    });
    setOpen(true);
  }

  function closeForm() {
    setOpen(false);
    setEditId(null);
    setSection("personal");
    setAccessPw("");
    setForm(emptyForm());
  }

  const label = (text: string, node: React.ReactNode) => (
    <label className="grid gap-1 text-sm">
      <span className="text-xs text-muted-foreground">{text}</span>
      {node}
    </label>
  );
  const textInput = (key: keyof FormState, type = "text") => (
    <input
      type={type}
      value={form[key] as string}
      onChange={(e) => set(key, e.target.value as never)}
      className={inputCls}
    />
  );

  const TABS = [
    { id: "team", label: "Team" },
    { id: "leave", label: "Leave" },
    { id: "payroll", label: "Payroll" },
    { id: "setup", label: "Setup & Salary" },
  ] as const;

  return (
    <>
      {/* One page for Staff + HR: Team profiles, Leave, Payroll, Setup */}
      <div className="mb-3 flex flex-wrap items-center gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={
              "border px-3 py-1.5 text-sm transition-colors " +
              (tab === t.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:text-foreground")
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "leave" ? (
        <LeavesView />
      ) : tab === "payroll" ? (
        <PayrollView />
      ) : tab === "setup" ? (
        <HrSetupView />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <Stat label="Staff members" value={String(team.length)} />
            <Stat label="Active" value={String(activeCount)} />
            <Stat label="With system access" value={String(withAccess)} hint="can sign in" />
            <Stat label="Roles" value={String(roles.length)} hint={roles.join(", ")} />
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              Manage staff profiles and choose who can sign in. Staff without access still appear
              here and in payroll.
            </p>
            {!open && (
              <Button
                variant="default"
                className="shrink-0 justify-center"
                onClick={() => {
                  setForm(emptyForm());
                  setEditId(null);
                  setSection("personal");
                  setOpen(true);
                }}
              >
                <Plus size={13} /> Add staff
              </Button>
            )}
          </div>

          {open && (
            <Card className="mt-3 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">
                    {editId ? "Edit staff member" : "New staff member"}
                  </span>
                  {editId && !isOwner && (
                    <div className="flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-600">
                      <Shield size={10} />
                      <span>Owner only</span>
                    </div>
                  )}
                </div>
                <button onClick={closeForm} className="text-muted-foreground hover:text-foreground">
                  <X size={14} />
                </button>
              </div>

              {/* Section tabs */}
              <div className="mt-2 flex flex-wrap items-center gap-1">
                {SECTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSection(s)}
                    className={
                      "border px-2.5 py-1 text-xs capitalize transition-colors " +
                      (section === s
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:text-foreground")
                    }
                  >
                    {s}
                  </button>
                ))}
              </div>

              <div className="mt-3">
                {section === "personal" && (
                  <div className="grid gap-2 md:grid-cols-3">
                    {label("First name *", textInput("firstName"))}
                    {label("Last name", textInput("lastName"))}
                    {label("Phone", textInput("phone"))}
                    {label("Personal email", textInput("personalEmail", "email"))}
                    {label("Date of birth", textInput("dateOfBirth", "date"))}
                    {label("Gender", textInput("gender"))}
                    {label("Address", textInput("address"))}
                    {label("City", textInput("city"))}
                    {label("NID number", textInput("nidNumber"))}
                    {label("Emergency contact", textInput("emergencyContactName"))}
                    {label("Emergency phone", textInput("emergencyContactPhone"))}
                  </div>
                )}

                {section === "employment" && (
                  <div className="grid gap-2 md:grid-cols-3">
                    {label("Designation", textInput("designation"))}
                    {label("Department", textInput("department"))}
                    {label("Joined", textInput("joinedAt", "date"))}
                    {label(
                      "Employment type",
                      <Select
                        value={form.employmentType}
                        onValueChange={(v) => set("employmentType", v)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="full_time">Full time</SelectItem>
                          <SelectItem value="part_time">Part time</SelectItem>
                          <SelectItem value="contract">Contract</SelectItem>
                        </SelectContent>
                      </Select>,
                    )}
                    {label("Employee code", textInput("employeeCode"))}
                    {label("Basic salary (৳)", textInput("basicSalary", "number"))}
                    {label("Housing allowance (৳)", textInput("housingAllowance", "number"))}
                    {label("Transport allowance (৳)", textInput("transportAllowance", "number"))}
                    {label("Medical allowance (৳)", textInput("medicalAllowance", "number"))}
                    {label("Other allowance (৳)", textInput("otherAllowance", "number"))}
                    {label("Provident fund (% of basic)", textInput("providentFundRate", "number"))}
                    {label("Salary effective from", textInput("salaryEffectiveFrom", "date"))}
                    {label(
                      "Role",
                      <Select
                        value={form.role}
                        onValueChange={(v) => set("role", v)}
                        disabled={!!editId && !isOwner}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="owner">Owner</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="salesman">Salesman</SelectItem>
                          <SelectItem value="staff">Staff</SelectItem>
                        </SelectContent>
                      </Select>,
                    )}
                    {label(
                      "Warehouse *",
                      <Select
                        value={form.storeLocation}
                        onValueChange={(v) => set("storeLocation", v)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Assign to warehouse" />
                        </SelectTrigger>
                        <SelectContent>
                          {locations.map((l) => (
                            <SelectItem key={l.id} value={l.name}>
                              {l.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>,
                    )}
                    {label(
                      "Status",
                      <button
                        type="button"
                        onClick={() => set("isActive", !form.isActive)}
                        className={`mt-1 w-fit rounded border px-3 py-1.5 text-xs ${
                          form.isActive
                            ? "border-green-500 bg-green-50 text-green-700"
                            : "border-gray-300 bg-gray-50 text-gray-700"
                        }`}
                      >
                        {form.isActive ? "Active" : "Inactive"}
                      </button>,
                    )}
                  </div>
                )}

                {section === "education" && (
                  <div className="space-y-2">
                    {form.education.map((e, i) => (
                      <div key={i} className="grid gap-2 md:grid-cols-4">
                        {["degree", "institution", "year", "result"].map((k) => (
                          <input
                            key={k}
                            placeholder={k}
                            value={(e as Record<string, string>)[k] ?? ""}
                            onChange={(ev) =>
                              set(
                                "education",
                                form.education.map((row, j) =>
                                  j === i ? { ...row, [k]: ev.target.value } : row,
                                ),
                              )
                            }
                            className={inputCls}
                          />
                        ))}
                        <button
                          type="button"
                          onClick={() =>
                            set(
                              "education",
                              form.education.filter((_, j) => j !== i),
                            )
                          }
                          className="w-fit text-xs text-sale hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => set("education", [...form.education, {}])}
                      className="flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <Plus size={11} /> Add education
                    </button>
                  </div>
                )}

                {section === "experience" && (
                  <div className="space-y-2">
                    {form.experience.map((e, i) => (
                      <div key={i} className="grid gap-2 md:grid-cols-4">
                        {["company", "role", "from", "to"].map((k) => (
                          <input
                            key={k}
                            placeholder={k}
                            value={(e as Record<string, string>)[k] ?? ""}
                            onChange={(ev) =>
                              set(
                                "experience",
                                form.experience.map((row, j) =>
                                  j === i ? { ...row, [k]: ev.target.value } : row,
                                ),
                              )
                            }
                            className={inputCls}
                          />
                        ))}
                        <button
                          type="button"
                          onClick={() =>
                            set(
                              "experience",
                              form.experience.filter((_, j) => j !== i),
                            )
                          }
                          className="w-fit text-xs text-sale hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => set("experience", [...form.experience, {}])}
                      className="flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <Plus size={11} /> Add experience
                    </button>
                  </div>
                )}

                {section === "access" && (
                  <div className="max-w-xl space-y-3">
                    {!editId ? (
                      <div className="grid gap-2 md:grid-cols-2">
                        {label("Login email", textInput("email", "email"))}
                        {label(
                          "Password",
                          <Input
                            type="password"
                            value={form.password}
                            onChange={(e) => set("password", e.target.value)}
                            className={inputCls}
                          />,
                        )}
                        <p className="text-xs text-muted-foreground md:col-span-2">
                          Leave blank to add this staff member <strong>without</strong> system
                          access — they can be granted access later.
                        </p>
                      </div>
                    ) : editing?.hasAccess ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                          <Pill tone="success">Has access</Pill>
                          <span className="text-muted-foreground">{editing.email}</span>
                        </div>
                        <Button
                          variant="ghost"
                          onClick={() => void onRevokeAccess()}
                          disabled={busy}
                        >
                          <ShieldOff size={13} /> Revoke system access
                        </Button>
                      </div>
                    ) : (
                      <div className="grid gap-2 md:grid-cols-2">
                        {label("Login email", textInput("email", "email"))}
                        {label(
                          "Password",
                          <Input
                            type="password"
                            value={accessPw}
                            onChange={(e) => setAccessPw(e.target.value)}
                            className={inputCls}
                          />,
                        )}
                        {label(
                          "Access role",
                          <Select value={accessRole} onValueChange={setAccessRole}>
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="manager">Manager</SelectItem>
                              <SelectItem value="salesman">Salesman</SelectItem>
                            </SelectContent>
                          </Select>,
                        )}
                        <div className="md:col-span-2">
                          <Button
                            variant="default"
                            onClick={() => void onGrantAccess()}
                            disabled={busy}
                          >
                            <Shield size={13} /> Grant system access
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-3 flex justify-end gap-2">
                <Button variant="ghost" onClick={closeForm}>
                  Cancel
                </Button>
                <Button variant="default" onClick={() => void onSubmit()} disabled={busy}>
                  {busy ? "Saving…" : editId ? "Update staff" : "Add staff"}
                </Button>
              </div>
            </Card>
          )}

          <div className="mt-3">
            {team.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No staff members yet.
              </div>
            ) : (
              <Table
                columns={["Name", "Role", "Warehouse", "Access", "Status", ""]}
                rows={team.map((s) => [
                  <span key="n">
                    {s.firstName} {s.lastName}
                    {s.designation && (
                      <span className="ml-2 text-xs text-muted-foreground">{s.designation}</span>
                    )}
                  </span>,
                  <span key="r" className="capitalize">
                    {s.role}
                  </span>,
                  s.storeLocation || "—",
                  <Pill key="a" tone={s.hasAccess ? "success" : "muted"}>
                    {s.hasAccess ? "Login" : "No login"}
                  </Pill>,
                  <Pill key="p" tone={s.isActive ? "success" : "muted"}>
                    {s.isActive ? "Active" : "Inactive"}
                  </Pill>,
                  <div key="e" className="flex items-center gap-3">
                    <button
                      onClick={() => openEdit(s)}
                      className="flex items-center gap-1 text-primary hover:underline"
                    >
                      <Pencil size={12} /> Edit
                    </button>
                    {isOwner && (
                      <button
                        onClick={async () => {
                          if (!confirm(`Remove ${s.firstName} ${s.lastName}?`)) return;
                          try {
                            const res = await fetch(`/api/dashboard/staff/${s.id}`, { method: "DELETE" });
                            if (!res.ok) {
                              const body = await res.json().catch(() => ({}));
                              toast.error(body.error || "Failed to remove staff");
                              return;
                            }
                            toast.success("Staff removed");
                            void qc.invalidateQueries({ queryKey: ["dashboard", "staff"] });
                          } catch {
                            toast.error("Failed to remove");
                          }
                        }}
                        className="flex items-center gap-1 text-sale hover:underline"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>,
                ])}
                sortData={team}
                sortKeys={["firstName", "role", "storeLocation", "hasAccess", "isActive", null]}
              />
            )}
          </div>
        </>
      )}
    </>
  );
}
