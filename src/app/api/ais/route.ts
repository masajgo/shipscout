import { NextRequest } from 'next/server';
import { WebSocket } from 'ws';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BOUNDING_BOXES = [
  [[25.0, 20.0], [45.0, 45.0]],
  [[55.0, -10.0], [100.0, 25.0]],
  [[-10.0, 45.0], [30.0, 65.0]],
  [[100.0, -10.0], [140.0, 40.0]],
];

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {}
      };

      const ws = new WebSocket('wss://stream.aisstream.io/v0/stream');

      ws.on('open', () => {
        ws.send(JSON.stringify({
          APIKey: process.env.AISSTREAM_API_KEY,
          BoundingBoxes: BOUNDING_BOXES,
          FilterMessageTypes: ['PositionReport', 'ShipStaticData'],
        }));
        send({ type: 'connected' });
      });

      ws.on('message', (data: Buffer | string) => {
        try {
          const msg = JSON.parse(data.toString());
          send({ type: 'vessel', data: msg });
        } catch {}
      });

      ws.on('error', () => {
        send({ type: 'error', message: 'AIS connection failed' });
        try { controller.close(); } catch {}
      });

      ws.on('close', () => {
        try { controller.close(); } catch {}
      });

      request.signal.addEventListener('abort', () => {
        ws.close();
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
