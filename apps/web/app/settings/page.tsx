import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Settings",
  description: "Manage your local Open Agents workspace settings.",
};

export default function SettingsPage() {
  redirect("/settings/preferences");
}
