"use client";

import { redirect } from "next/navigation";

export default function CategoriesPage() {
  redirect("/dashboard/expenses?tab=new");
}
