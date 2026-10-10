import { eq } from "drizzle-orm";
import { db } from "./index";
import { platformUsers } from "./schema";
import { seedPlans } from "./seed-data";
import { hashPassword } from "@/lib/auth";

await seedPlans(db);
console.log("plans seeded");

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
if (email && password) {
  if (password.length < 10) throw new Error("ADMIN_PASSWORD must be at least 10 characters");
  const [existing] = await db.select().from(platformUsers).where(eq(platformUsers.email, email));
  if (!existing) {
    await db.insert(platformUsers).values({ email, name: "Super Admin", role: "super_admin", passwordHash: hashPassword(password) });
    console.log(`super admin created: ${email}`);
  } else {
    console.log("super admin already exists; password unchanged");
  }
} else {
  console.log("ADMIN_EMAIL / ADMIN_PASSWORD not set; no admin created");
}
process.exit(0);
