# HR & Payroll Module

## Context

The store currently has a `staff` table (identity + role + storeLocation + isActive) and a `users` table (login identity with `x-user-id` header auth), but no attendance, leave, policy, or payroll system. Staff time is tracked manually (if at all), and salary is computed off-system.

This module adds a device-driven attendance system that records punches pushed from a biometric/ADMS device over HTTP, pairs them into in/out intervals to compute time outside the shop (with per-day breakdown), applies configurable leave and attendance policies, and generates monthly payroll runs that auto-compute deductions from those metrics.

**Decisions already confirmed with the user:**
- Device = **Real-time push** — device/ADMS pushes punches over HTTP (no polling).
- Payroll = **Auto salary + deductions** — salary base + auto-computed deductions from attendance/leave metrics.
- Pay period = **Monthly**.
- Roster = **Existing staff only** — no new hiring flow; attach devices/policies/salary to existing `staff` rows.
- Access = any employee (salesman, manager, etc.) can be granted system access via existing `staff` + `users` linkage.

## Constraints / Existing patterns to reuse

- **DB**: Drizzle ORM + Neon serverless Postgres. `db` (neon-http) for reads; `txDb` (websocket Pool) for transactions — import from `src/db/index.ts`. Money = integer BDT. Timestamps = `timestamptz .defaultNow()`. DB snake_case / TS camelCase.
- **Schema push**: use `db:push` (NOT `db:migrate`, which hangs on Neon — see memory note `project_neon_tooling.md`).
- **Auth/scope**: `getScope(headers)` in `src/lib/authz.ts`; `ownerOnly(scope)` for owner-gated routes. Public device push route uses its own `x-device-token` secret.
- **Feature gating**: add new keys to `FeatureKey` union + `DEFAULT_FEATURE_VISIBILITY` + `featureSettings` (schema ~line 691 in `src/db/schema.ts`).
- **Timezone**: Bangladesh is UTC+06:00. Compute "today" in Dhaka local time (`dhakaDate`) so a punch at 00:30 local lands on the correct day.

## Schema (new tables — append to `src/db/schema.ts`)

1. **`attendanceDevices`** — `id`, `name`, `tokenHash` (sha256 of device token), `location`, `isActive`, timestamps.
2. **`deviceEnrollments`** — maps staff to a device: `id`, `deviceId`, `staffId`, `deviceUserId` (the staff's ID on that device), `isActive`, timestamps.
3. **`attendancePunches`** — raw events: `id`, `staffId`, `deviceId`, `punchType` (`in`|`out`), `punchedAt` (timestamptz), `rawPayload` (jsonb), timestamps.
4. **`attendanceDays`** — one row per staff per Dhaka date: `id`, `staffId`, `date` (date), `firstIn`, `lastOut`, `totalInsideSec`, `totalOutsideSec`, `outsideCount`, `status` (`present`|`absent`|`leave`|`holiday`), `minutesLate`, `earlyDepartureSec`, `summaryJson` (jsonb), timestamps.
5. **`leaveTypes`** — `id`, `name`, `code`, `color`, `paid`, `annualAllowanceDays`, `requiresApproval`, `isActive`.
6. **`leaveRequests`** — `id`, `staffId`, `leaveTypeId`, `startDate`, `endDate`, `days`, `reason`, `status` (`pending`|`approved`|`rejected`|`cancelled`), `reviewedBy`, `reviewedAt`, timestamps.
7. **`leaveBalances`** — `id`, `staffId`, `leaveTypeId`, `year`, `totalDays`, `usedDays`, `carriedForward`, unique(staffId, leaveTypeId, year).
8. **`attendancePolicies`** — `id`, `name`, `shiftStart` (time), `shiftEnd` (time), `graceMinutes`, `latePenaltyPerMinute` (BDT int), `earlyDepartPenaltyPerMinute`, `maxOutsideMinutesFree` (free outside threshold), `outsidePenaltyPerMinute`, `absentPenalty` (flat BDT), `halfDayThresholdMinutes`, `weekendDays` (int[]), `isDefault`, `isActive`, timestamps.
9. **`staffPolicyAssignments`** — `id`, `staffId`, `policyId`, `salary` (BDT int), `effectiveFrom`, `effectiveTo`, `isActive`.
10. **`payrollRuns`** — `id`, `periodStart`, `periodEnd`, `status` (`draft`|`finalized`|`paid`), `createdBy`, `finalizedAt`, timestamps.
11. **`payrollItems`** — `id`, `payrollRunId`, `staffId`, `grossSalary`, `deductions` (jsonb breakdown), `netSalary`, `notes`, timestamps.

## Lib helpers

- **`src/lib/attendance.ts`**
  - `dhakaDate(now?: Date): string` — returns `YYYY-MM-DD` in Asia/Dhaka (+06:00).
  - `pairPunches(punches)`: sort by `punchedAt`, pair in→out; orphan "in" stays open until next "out" (or day end); orphan "out" ignored/flagged.
  - `computeDaySummary(staffId, date, policy)`: from paired intervals compute `firstIn`, `lastOut`, `totalInsideSec`, `totalOutsideSec`, `outsideCount`, `minutesLate` (vs shiftStart+grace), `earlyDepartureSec` (vs shiftEnd).
  - `recomputeDay(staffId, date)`: upsert `attendanceDays` for that date.
- **`src/lib/payroll.ts`**
  - `computeDeductions(staffId, period, policy, salary)`: sum late/early-depart/outside/absent penalties across `attendanceDays` + leave deductions → returns `{ breakdown, total }`.
  - `generatePayrollRun(periodStart, periodEnd)`: iterate staff assignments, compute gross + deductions + net, write `payrollItems`.

## API routes

**Public device push (no dashboard auth):**
- `app/api/attendance/punch/route.ts` — `POST { deviceToken, deviceUserId, punchType, punchedAt }`. Validate `sha256(deviceToken)` against `attendanceDevices.tokenHash`, resolve staff via `deviceEnrollments`, insert `attendancePunches`, call `recomputeDay`. Return `{ ok: true }`.

**Dashboard routes (behind `getScope` + `ownerOnly` where appropriate):**
- `app/api/dashboard/hr/attendance/route.ts` — GET list by date range (with per-day summary + outside breakdown).
- `app/api/dashboard/hr/attendance/recompute/route.ts` — POST force-recompute a date.
- `app/api/dashboard/hr/leaves/route.ts` — GET list, POST create request.
- `app/api/dashboard/hr/leaves/[id]/route.ts` — PATCH approve/reject/cancel.
- `app/api/dashboard/hr/leave-types/route.ts` — CRUD leave types.
- `app/api/dashboard/hr/policies/route.ts` — CRUD attendance policies.
- `app/api/dashboard/hr/devices/route.ts` — CRUD devices (return plain token once on create).
- `app/api/dashboard/hr/profiles/route.ts` — GET/PUT staff policy assignment + salary.
- `app/api/dashboard/hr/payroll/route.ts` — GET runs; POST generate draft run.
- `app/api/dashboard/hr/payroll/[id]/route.ts` — GET detail, POST finalize/pay.

## UI pages (under `app/(dashboard)/dashboard/hr/`)

- **`attendance/page.tsx`** — date-range picker, table of staff × day with first-in/last-out, total inside, outside count + duration, late/early flags. Filters by staff/status.
- **`leaves/page.tsx`** — leave calendar/list, request form, approval queue (owner).
- **`payroll/page.tsx`** — monthly run list, generate run, detail view with per-staff gross/deductions/net breakdown, finalize/pay.
- **`setup/page.tsx`** — tabs for Devices, Policies, Leave Types, Staff Profiles (salary + policy assignment).

## Feature gating & nav

- Add `FeatureKey` entries: `hr`, `attendance`, `leave`, `payroll` (extend union + `DEFAULT_FEATURE_VISIBILITY`).
- Add nav group "HR" in `src/components/dashboard/dashboard-shell.tsx` `groups` array: Attendance, Leaves, Payroll, Setup.

## Build order

1. **Schema**: add 11 tables to `src/db/schema.ts`; run `db:push`.
2. **Lib**: `src/lib/attendance.ts` (dhakaDate, pairPunches, computeDaySummary, recomputeDay).
3. **Attendance API + device push**: `punch` route + dashboard attendance routes.
4. **Leave**: leave types + requests + balances routes.
5. **Policies**: policies CRUD + staff assignments.
6. **Payroll lib**: `src/lib/payroll.ts` (computeDeductions, generatePayrollRun).
7. **Payroll API + client**: routes + `src/lib/api.ts` helpers.
8. **UI pages**: 4 hr pages + nav group + feature keys.
9. **Feature keys** wire-up.

## Verification

- `npm run db:push` succeeds with no errors (schema pushed to Neon).
- `npm run build` (or `tsc --noEmit`) passes — no type errors.
- Manual: seed one device + enroll one staff, POST a sample punch to `/api/attendance/punch` with the token, confirm `attendancePunches` + `attendanceDays` rows and correct `totalOutsideSec`/`outsideCount` for a mid-day out/in.
- Manual: create a policy with late/outside penalties, generate a monthly payroll run, confirm deductions and net salary match expected math.
- Manual: grant a non-owner staff access via `users` + `staff`, confirm HR nav items respect feature permissions.
