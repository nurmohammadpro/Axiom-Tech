/** Shared coercion + allowlist for staff profile writes (create & update). */

export const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

export const int = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : null;
};

export const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Profile columns accepted on create and update (everything but userId/role). */
export function profileColumns(body: Record<string, unknown>) {
  return {
    firstName: str(body.firstName),
    lastName: str(body.lastName),
    phone: str(body.phone),
    personalEmail: str(body.personalEmail),
    dateOfBirth: str(body.dateOfBirth),
    gender: str(body.gender),
    address: str(body.address),
    city: str(body.city),
    nidNumber: str(body.nidNumber),
    emergencyContactName: str(body.emergencyContactName),
    emergencyContactPhone: str(body.emergencyContactPhone),
    photoUrl: str(body.photoUrl),
    designation: str(body.designation),
    department: str(body.department),
    joinedAt: str(body.joinedAt),
    employmentType: str(body.employmentType) ?? "full_time",
    education: arr(body.education),
    experience: arr(body.experience),
    employeeCode: str(body.employeeCode),
    monthlySalary: int(body.monthlySalary),
    basicSalary: int(body.basicSalary),
    housingAllowance: int(body.housingAllowance) ?? 0,
    transportAllowance: int(body.transportAllowance) ?? 0,
    medicalAllowance: int(body.medicalAllowance) ?? 0,
    otherAllowance: int(body.otherAllowance) ?? 0,
    providentFundRate: int(body.providentFundRate) ?? 0,
    salaryEffectiveFrom: str(body.salaryEffectiveFrom),
  };
}
