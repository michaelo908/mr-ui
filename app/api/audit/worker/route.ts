import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { advance, auditAdmin, requireAuditEnvironment } from "@/lib/audit/server";
export const maxDuration = 300;
export async function POST(req:Request){
 try {
  requireAuditEnvironment();
  const expected=process.env.MR_API_KEY;const supplied=req.headers.get("x-api-key");
  if(!expected||!supplied||Buffer.byteLength(expected)!==Buffer.byteLength(supplied)||!timingSafeEqual(Buffer.from(expected),Buffer.from(supplied)))return NextResponse.json({error:"Not authorised"},{status:401});
  const now=new Date().toISOString();
  const {data,error}=await auditAdmin().from("reader_audits").select("*").or(`status.eq.queued,and(status.eq.running,lease_until.lt.${now})`).order("updated_at").limit(1).maybeSingle();
  if(error)throw new Error("Audit queue is unavailable.");
  if(!data)return NextResponse.json({worked:false});
  await advance(data);
  return NextResponse.json({worked:true});
 }catch{return NextResponse.json({error:"Audit worker is temporarily unavailable."},{status:503});}
}
