import type { Metadata } from "next";
import { RegisterForm } from "@/components/features/auth/auth-forms";

export const metadata: Metadata = { title: "Create account" };

export default function RegisterPage() {
  return <RegisterForm />;
}
