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

// Singleton — one WebSocket shared across all SSE clients
const clients = new Set<(data: string) => void>();
let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function broadcast(data: object) {
  const str = `data: ${JSON.stringify(data)}\n\n`;
  clients.forEach(send => { try { send(str); } catch {} });
}

function connectAIS() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }

  ws = new WebSocket('wss://stream.aisstream.io/v0/stream');

  ws.on('open', () => {
    ws!.send(JSON.stringify({
      APIKey: process.env.AISSTREAM_API_KEY,
      BoundingBoxes: BOUNDING_BOXES,
      FilterMessageTypes: ['PositionReport', 'ShipStaticData'],
    }));
    broadcast({ type: 'connected' });
  });

  ws.on('message', (data: Buffer | string) => {
    try {
      const msg = JSON.parse(data.toString());
      broadcast({ type: 'vessel', data: msg });
    } catch {}
  });

  ws.on('error', () => {
    broadcast({ type: 'error', message: 'AIS connection failed' });
    scheduleReconnect();
  });

  ws.on('close', () => {
    scheduleReconnect();
  });
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (clients.size > 0) connectAIS();
  }, 10000);
}

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (str: string) => controller.enqueue(encoder.encode(str));
      clients.add(send);

      // If already connected, tell this client immediately
      if (ws?.readyState === WebSocket.OPEN) {
        send(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
      } else {
        connectAIS();
      }

      request.signal.addEventListener('abort', () => {
        clients.delete(send);
        try { controller.close(); } catch {}
        // Close WebSocket only if no clients remain
        if (clients.size === 0) {
          ws?.close();
          ws = null;
        }
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
