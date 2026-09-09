import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { name, company, email, intent, message } = await req.json();
    if (!name || !email) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from:     "noreply@turqomarine.com",
          to:       "info@turqomarine.com",
          reply_to: email,
          subject:  `Deal inquiry — ${intent ?? "General"} — ${name}`,
          html: `
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Company:</strong> ${company ?? "—"}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Intent:</strong> ${intent ?? "—"}</p>
            <p><strong>Message:</strong><br>${(message ?? "").replace(/\n/g, "<br>")}</p>
          `,
        }),
      });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to send" }, { status: 500 });
  }
}
