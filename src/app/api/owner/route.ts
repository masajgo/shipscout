import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const mmsi = request.nextUrl.searchParams.get("mmsi");
  if (!mmsi) return NextResponse.json({ error: "mmsi required" }, { status: 400 });

  const apiKey = process.env.DATALASTIC_API_KEY;
  if (!apiKey) {
    // No API key — return empty ownership data gracefully
    return NextResponse.json({ vessel: null, ownership: null });
  }

  try {
    const [vesselRes, ownerRes] = await Promise.allSettled([
      fetch(`https://api.datalastic.com/api/v0/vessel?api-key=${apiKey}&mmsi=${mmsi}`),
      fetch(`https://api.datalastic.com/api/v0/vessel_owner?api-key=${apiKey}&mmsi=${mmsi}`),
    ]);

    const vessel = vesselRes.status === "fulfilled" && vesselRes.value.ok
      ? (await vesselRes.value.json())?.data
      : null;

    const ownerJson = ownerRes.status === "fulfilled" && ownerRes.value.ok
      ? (await ownerRes.value.json())
      : null;

    const ownership = ownerJson?.data ?? null;

    return NextResponse.json({ vessel, ownership });
  } catch {
    return NextResponse.json({ vessel: null, ownership: null });
  }
}
