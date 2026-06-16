import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mmsi = searchParams.get("mmsi") || "";
  const name = searchParams.get("name") || "";

  // Try multiple sources in order
  const sources = [
    // MarineTraffic public photo (no auth needed for basic)
    `https://photos.marinetraffic.com/ais/showphoto.aspx?mmsi=${mmsi}`,
    // VesselFinder public
    `https://www.vesselfinder.com/vessels/photos?mmsi=${mmsi}`,
    // MyShipTracking
    `https://www.myshiptracking.com/public/images/ships/ship_${mmsi}.jpg`,
    // ShipSpotting search
    `https://www.shipspotting.com/photos/search?mmsi=${mmsi}`,
  ];

  // Try to find a working photo URL
  for (const url of sources) {
    try {
      const res = await fetch(url, {
        method: "HEAD",
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok && res.headers.get("content-type")?.includes("image")) {
        return NextResponse.json({ url, found: true });
      }
    } catch {
      continue;
    }
  }

  return NextResponse.json({ url: null, found: false });
}