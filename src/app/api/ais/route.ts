import { NextResponse } from "next/server";
import { WebSocket } from "ws";

export const runtime = "nodejs";
export const maxDuration = 9;

const BOUNDING_BOXES = [[[-90.0, -180.0], [90.0, 180.0]]];

export interface VesselData {
  mmsi:        string;
  name:        string;
  callSign:    string;
  imo:         string;
  lat:         number;
  lon:         number;
  speed:       number;
  course:      number;
  heading:     number;
  navStatus:   number;
  vesselType:  number;
  length:      number;
  width:       number;
  draught:     number;
  destination: string;
  eta:         string;
  timestamp:   string;
}

export async function GET() {
  const vessels = await collectVessels(4000);

  return NextResponse.json(
    { vessels, ts: Date.now() },
    {
      headers: {
        // CDN caches for 60s, then serves stale while refreshing in background
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    }
  );
}

function collectVessels(ms: number): Promise<VesselData[]> {
  return new Promise((resolve) => {
    const partials = new Map<string, Partial<VesselData>>();
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      try { ws.terminate(); } catch {}
      resolve(
        Array.from(partials.values()).filter(
          (v): v is VesselData =>
            !!v.mmsi && !!v.name && v.name.trim() !== "" && v.lat !== undefined
        ) as VesselData[]
      );
    };

    const ws = new WebSocket("wss://stream.aisstream.io/v0/stream");
    setTimeout(finish, ms);

    ws.on("open", () => {
      ws.send(JSON.stringify({
        APIKey: process.env.AISSTREAM_API_KEY,
        BoundingBoxes: BOUNDING_BOXES,
        FilterMessageTypes: ["PositionReport", "ShipStaticData"],
      }));
    });

    ws.on("message", (raw: Buffer | string) => {
      try {
        const data = JSON.parse(raw.toString());
        const type = data.MessageType as string;
        const mmsi = data.MetaData?.MMSI?.toString();
        if (!mmsi) return;

        const cur = partials.get(mmsi) || {};

        if (type === "PositionReport") {
          const pos = data.Message.PositionReport;
          partials.set(mmsi, {
            ...cur, mmsi,
            lat:    pos.Latitude,
            lon:    pos.Longitude,
            speed:  pos.Sog  ?? 0,
            course: pos.Cog  ?? 0,
            heading:   pos.TrueHeading        ?? 511,
            navStatus: pos.NavigationalStatus ?? 0,
            timestamp: data.MetaData?.time_utc || new Date().toISOString(),
          });
        }

        if (type === "ShipStaticData") {
          const stat = data.Message.ShipStaticData;
          const dim  = stat.Dimension || {};
          partials.set(mmsi, {
            ...cur, mmsi,
            name:        (stat.Name        || "").trim() || cur.name        || "",
            callSign:    (stat.CallSign    || "").trim() || cur.callSign    || "",
            imo:         stat.ImoNumber?.toString()      || cur.imo         || "",
            vesselType:  stat.Type                      ?? cur.vesselType  ?? 0,
            length:      (dim.A || 0) + (dim.B || 0),
            width:       (dim.C || 0) + (dim.D || 0),
            draught:     stat.MaximumStaticDraught       ?? 0,
            destination: (stat.Destination || "").trim() || cur.destination || "",
            eta:         stat.Eta                        || cur.eta         || "",
          });
        }

        if (data.MetaData?.ShipName && !cur.name) {
          partials.set(mmsi, { ...cur, name: data.MetaData.ShipName.trim() });
        }
      } catch {}
    });

    ws.on("error", finish);
    ws.on("close", () => { if (!settled) finish(); });
  });
}
