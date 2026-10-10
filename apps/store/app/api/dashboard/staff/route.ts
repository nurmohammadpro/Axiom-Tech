import { db } from "@/db";
import { users, staff, locations } from "@/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { count, eq } from "drizzle-orm";
import { getScope, requireStaff, requireOwner } from "@/lib/authz";
import { hashPassword } from "@/lib/auth";
import { str, profileColumns } from "@/lib/staff";

export const dynamic = "force-dynamic";

/** Fall back to the default managed warehouse for unassigned staff. */
async function defaultLocation(): Promise<string> {
  const [def] = await db
    .select({ name: locations.name })
    .from(locations)
    .where(eq(locations.isDefault, true))
    .limit(1);
  return def?.name ?? "Play Store Downtown";
}

export async function GET(request: NextRequest) {
  const scope = await getScope(request.headers);
  const denied = requireStaff(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  const rows = await db
    .select({
      id: staff.id,
      userId: staff.userId,
      role: staff.role,
      storeLocation: staff.storeLocation,
      isActive: staff.isActive,
      firstName: staff.firstName,
      lastName: staff.lastName,
      phone: staff.phone,
      personalEmail: staff.personalEmail,
      dateOfBirth: staff.dateOfBirth,
      gender: staff.gender,
      address: staff.address,
      city: staff.city,
      nidNumber: staff.nidNumber,
      emergencyContactName: staff.emergencyContactName,
      emergencyContactPhone: staff.emergencyContactPhone,
      photoUrl: staff.photoUrl,
      designation: staff.designation,
      department: staff.department,
      joinedAt: staff.joinedAt,
      employmentType: staff.employmentType,
      education: staff.education,
      experience: staff.experience,
      employeeCode: staff.employeeCode,
      monthlySalary: staff.monthlySalary,
      basicSalary: staff.basicSalary,
      housingAllowance: staff.housingAllowance,
      transportAllowance: staff.transportAllowance,
      medicalAllowance: staff.medicalAllowance,
      otherAllowance: staff.otherAllowance,
      providentFundRate: staff.providentFundRate,
      salaryEffectiveFrom: staff.salaryEffectiveFrom,
      userEmail: users.email,
      userFirstName: users.firstName,
      userLastName: users.lastName,
    })
    .from(staff)
    .leftJoin(users, eq(staff.userId, users.id))
    .orderBy(staff.role);

  return NextResponse.json(
    rows.map((r) => ({
      ...r,
      firstName: r.firstName ?? r.userFirstName ?? "",
      lastName: r.lastName ?? r.userLastName ?? "",
      email: r.userEmail ?? r.personalEmail ?? "",
      hasAccess: r.userId != null,
    })),
  );
}

export async function POST(request: NextRequest) {
  const scope = await getScope(request.headers);
  const denied = requireOwner(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  const body = await request.json();
  const firstName = str(body.firstName);
  const lastName = str(body.lastName);
  if (!firstName) {
    return NextResponse.json({ error: "First name is required" }, { status: 400 });
  }

  const email = str(body.email);
  const password = str(body.password);
  const grantAccess = Boolean(email && password);
  const role = str(body.role) ?? (grantAccess ? "salesman" : "staff");

  if (grantAccess) {
    if (!["owner", "manager", "salesman"].includes(role)) {
      return NextResponse.json(
        { error: "Role must be owner, manager or salesman" },
        { status: 400 },
      );
    }
    const [existing] = await db.select().from(users).where(eq(users.email, email!));
    if (existing) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }
  }

  const storeLocation = str(body.storeLocation) || (await defaultLocation());
  const profile = profileColumns(body);

  let userId: string | null = null;
  if (grantAccess) {
    const [user] = await db
      .insert(users)
      .values({
        email: email!,
        passwordHash: hashPassword(password!),
        firstName,
        lastName: lastName ?? "",
        role,
      })
      .returning();
    userId = user.id;
  }

  // Auto employee code (EMP-0001) when the owner doesn't supply one.
  let employeeCode = profile.employeeCode;
  if (!employeeCode) {
    const [c] = await db.select({ n: count() }).from(staff);
    employeeCode = `EMP-${String(Number(c?.n ?? 0) + 1).padStart(4, "0")}`;
  }

  const [record] = await db
    .insert(staff)
    .values({
      userId,
      role,
      storeLocation,
      isActive: body.isActive ?? true,
      ...profile,
      employeeCode,
    })
    .returning();

  return NextResponse.json(
    { ...record, email: email ?? record.personalEmail ?? "", hasAccess: userId != null },
    { status: 201 },
  );
}
