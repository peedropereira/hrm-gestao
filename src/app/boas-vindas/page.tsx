import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { Onboarding } from "./onboarding";

export const metadata: Metadata = { title: "Boas-vindas" };

export default async function WelcomePage() {
  const user = await requireUser();
  return <Onboarding name={user.name} />;
}
