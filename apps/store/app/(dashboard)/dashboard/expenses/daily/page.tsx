"use client";

import { redirect } from "next/navigation";

export default function DailyExpensePage() {
  redirect("/dashboard/expenses?tab=new");
}
