import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/listings/upload — upload a listing photo to Vercel Blob
// Content-Type: multipart/form-data, field: "file"
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: "Invalid form data" }, { status: 400 });

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Only images allowed" }, { status: 422 });
  }
  if (file.size > 8 * 1024 * 1024) {
    return NextResponse.json({ error: "Max 8 MB per photo" }, { status: 422 });
  }

  const ext      = file.name.split(".").pop() ?? "jpg";
  const pathname = `listing-photos/${session.id}/${Date.now()}.${ext}`;

  const { url } = await put(pathname, file, {
    access: "public",
    token:  process.env.BLOB_READ_WRITE_TOKEN,
  });

  return NextResponse.json({ url });
}
