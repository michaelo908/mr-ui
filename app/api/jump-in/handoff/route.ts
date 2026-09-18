import { NextRequest, NextResponse } from "next/server";
import {
  encodedHandoffBytes,
  isJumpInHandoffToken,
  JUMP_IN_HANDOFF_MAX_BYTES,
  JUMP_IN_HANDOFF_VERSION,
  type JumpInHandoffImage,
  type JumpInHandoffPayload,
} from "@/lib/jump-in-handoff";
import {
  createJumpInHandoff,
  handoffRateBucket,
  readJumpInHandoff,
} from "@/lib/jump-in-handoff-server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATA_URL = /^data:image\/(?:avif|gif|jpe?g|png|webp);base64,[A-Za-z0-9+/=\s]+$/i;

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  return !origin || origin === request.nextUrl.origin;
}

function requestAddress(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() || "unknown";
}

function validImages(value: unknown): value is JumpInHandoffImage[] {
  return Array.isArray(value) && value.length <= 6 && value.every((image) => {
    if (!image || typeof image !== "object") return false;
    const candidate = image as Partial<JumpInHandoffImage>;
    return typeof candidate.name === "string" && candidate.name.length <= 240 &&
      typeof candidate.type === "string" && candidate.type.startsWith("image/") &&
      typeof candidate.lastModified === "number" && Number.isFinite(candidate.lastModified) &&
      typeof candidate.dataUrl === "string" && DATA_URL.test(candidate.dataUrl);
  });
}

function parsePayload(value: unknown): JumpInHandoffPayload | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<JumpInHandoffPayload>;
  if (
    !UUID.test(String(candidate.sessionId)) ||
    !["text", "url", "images"].includes(String(candidate.inputMode)) ||
    typeof candidate.draft !== "string" || candidate.draft.length > 120_000 ||
    typeof candidate.urlDraft !== "string" || candidate.urlDraft.length > 8_192 ||
    typeof candidate.selectedGraviton !== "string" || candidate.selectedGraviton.length > 160 ||
    (candidate.cadence !== "dynamic" && candidate.cadence !== "sustained") ||
    !validImages(candidate.images)
  ) return null;

  const payload: JumpInHandoffPayload = {
    version: JUMP_IN_HANDOFF_VERSION,
    sessionId: candidate.sessionId as string,
    inputMode: candidate.inputMode as JumpInHandoffPayload["inputMode"],
    draft: candidate.draft as string,
    urlDraft: candidate.urlDraft as string,
    selectedGraviton: candidate.selectedGraviton as string,
    cadence: candidate.cadence as JumpInHandoffPayload["cadence"],
    images: candidate.images as JumpInHandoffImage[],
  };
  return encodedHandoffBytes(payload) <= JUMP_IN_HANDOFF_MAX_BYTES ? payload : null;
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  const payload = parsePayload(await request.json().catch(() => null));
  if (!payload) return NextResponse.json({ error: "invalid_handoff" }, { status: 400 });

  try {
    return NextResponse.json({
      token: await createJumpInHandoff(payload, handoffRateBucket(requestAddress(request))),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "jump_in_handoff_limited") {
      return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
    }
    return NextResponse.json({ error: "handoff_unavailable" }, { status: 503 });
  }
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!isJumpInHandoffToken(token)) return NextResponse.json({ error: "invalid_handoff" }, { status: 400 });
  try {
    const payload = await readJumpInHandoff(token);
    if (!payload) return NextResponse.json({ error: "handoff_unavailable" }, { status: 410 });
    return NextResponse.json({ payload }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "handoff_unavailable" }, { status: 503 });
  }
}
