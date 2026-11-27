import { notFound } from "next/navigation";
import { requireAuditEnvironment } from "@/lib/audit/server";
import AuditWorkspace from "./workspace";
export const dynamic = "force-dynamic";
export default function AuditPage() {
  try {
    requireAuditEnvironment();
  } catch {
    notFound();
  }
  return <AuditWorkspace />;
}
