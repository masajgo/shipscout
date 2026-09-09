import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  try {
    const { name, company, email, intent, message } = await req.json();
    if (!name || !email) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    await resend.emails.send({
      from: "noreply@turqomarine.com",
      to:   "info@turqomarine.com",
      replyTo: email,
      subject: `Deal inquiry — ${intent ?? "General"} — ${name}`,
      html: `
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Company:</strong> ${company ?? "—"}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Intent:</strong> ${intent ?? "—"}</p>
        <p><strong>Message:</strong><br>${(message ?? "").replace(/\n/g, "<br>")}</p>
      `,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to send" }, { status: 500 });
  }
}
