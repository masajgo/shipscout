import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const imo = req.nextUrl.searchParams.get("imo");
  if (!imo) return NextResponse.json({ error: "IMO required" }, { status: 400 });

  const apiKey = process.env.DATALASTIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "API key missing" }, { status: 500 });

  try {
    const res = await fetch(
      `https://api.datalastic.com/api/maritime_reports/ownership?api-key=${apiKey}&imo=${imo}`,
      { next: { revalidate: 3600 } }
    );
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    void err;
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}
