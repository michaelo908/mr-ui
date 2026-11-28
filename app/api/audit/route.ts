import { NextResponse } from "next/server";
import {
  BUDGETS,
  normalizePageContexts,
  normalizeUrls,
  type AuditKind,
} from "@/lib/audit/contracts";
import {
  auditAdmin,
  auditSignal,
  entitlementDetails,
  identity,
  ownedAudit,
  publicAudit,
  rateBuckets,
  requireAuditEnvironment,
  sameOrigin,
} from "@/lib/audit/server";
export async function GET() {
  try {
    requireAuditEnvironment();
    const actor = await identity();
    if (!actor.user && !actor.hash)
      return NextResponse.json({ audits: [], signedIn: false });
    let query = auditAdmin()
      .from("reader_audits")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    query = actor.user
      ? query.eq("user_id", actor.user.id)
      : query.eq("anonymous_hash", actor.hash).is("user_id", null);
    const { data, error } = await query;
    if (error) throw new Error("Saved audits are temporarily unavailable.");
    const purchases = actor.user
      ? await auditAdmin()
          .from("reader_audit_entitlements")
          .select("entitlement_key,kind,parent_id")
          .eq("user_id", actor.user.id)
          .like("entitlement_key", "checkout:%")
          .is("consumed_at", null)
          .is("audit_id", null)
      : { data: [] };
    return NextResponse.json({
      audits: (data || []).map(publicAudit),
      signedIn: !!actor.user,
      purchases: purchases.data || [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Audit unavailable" },
      { status: 503 },
    );
  }
}
export async function POST(req: Request) {
  try {
    requireAuditEnvironment();
    sameOrigin(req);
    const body = await req.json();
    if (!/^[\da-f-]{36}$/i.test(body.id))
      throw new Error("Invalid request identifier.");
    const kind: AuditKind = body.kind;
    if (!Object.hasOwn(BUDGETS, kind)) throw new Error("Invalid audit type.");
    const actor = await identity(true);
    if (!actor.user)
      return NextResponse.json(
        { error: "Sign in to purchase or use an audit." },
        { status: 401 },
      );
    let urls = normalizeUrls(body.urls, kind);
    let contexts = normalizePageContexts(body.contexts, urls);
    let parent = null;
    if (kind === "readiness") {
      parent = await ownedAudit(body.parentId);
      if (
        parent.kind !== "comprehensive" ||
        parent.status !== "completed" ||
        parent.user_id !== actor.user?.id
      )
        throw new Error("Select your completed comprehensive audit.");
      urls = parent.urls;
      contexts = parent.page_contexts || urls.map(() => "");
    }
    const grant = await entitlementDetails(actor.user!.id, kind, body.checkout);
    const daily = Number(process.env.AUDIT_DAILY_USD || "25");
    if (!Number.isFinite(daily) || daily <= 0 || daily > 100)
      throw new Error("Audit daily budget is not configured.");
    const { data, error } = await auditAdmin().rpc("create_reader_audit", {
      p_id: body.id,
      p_user: actor.user?.id || null,
      p_anonymous: actor.hash,
      p_kind: kind,
      p_urls: urls,
      p_parent: parent?.id || null,
      p_entitlement: grant.key,
      // A completed mini already supplies the homepage capture and page report.
      // Reserve only the remaining work, while retaining a conservative bound.
      p_reserve:
        kind === "comprehensive" && grant.sourceAuditId
          ? BUDGETS.comprehensive.reserve - BUDGETS.mini.reserve
          : BUDGETS[kind].reserve,
      p_daily_limit: Math.floor(daily * 1000000),
      p_buckets: rateBuckets(req, actor.user?.id || null, actor.hash, kind),
      p_source: grant.sourceAuditId,
      p_contexts: contexts,
    });
    if (error) throw new Error(error.message);
    await auditSignal("audit.started", {
      id: data,
      kind,
      user_id: actor.user?.id || null,
      anonymous_hash: actor.hash,
    });
    return NextResponse.json({ audit: publicAudit(await ownedAudit(data)) });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not start audit.",
      },
      { status: 400 },
    );
  }
}
