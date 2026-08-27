'use strict';

/**
 * updateScrapPrices.js — Scrap yard fiyatlarını güncelle ve değişim alarmı gönder
 *
 * Kullanım:
 *   node scripts/updateScrapPrices.js              # mevcut fiyatları göster
 *   node scripts/updateScrapPrices.js --show        # detaylı tablo
 *   node scripts/updateScrapPrices.js --set chittagong tanker 425 "GMS Week 34 2026"
 *   node scripts/updateScrapPrices.js --set alang bulker 385
 *   node scripts/updateScrapPrices.js --alert       # değişim varsa email gönder
 *   node scripts/updateScrapPrices.js --all "GMS Week 34 2026" 405 425 395 415 380 400 270 280 290
 *                                                   # tüm fiyatları güncelle (bdesh,pak,india,turkey × bulker,tanker,container)
 *
 * --all sırası: chtg-bulker chtg-tanker pk-bulker pk-tanker alang-bulker alang-tanker ali-bulker ali-tanker ali-cont
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });
const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const HISTORY_FILE = path.resolve(__dirname, '../scraper/data/scrap_price_history.json');
const RESEND_KEY = process.env.RESEND_API_KEY;

const YARD_NAMES = { chittagong: 'Chittagong', gadani: 'Gadani', alang: 'Alang', aliaga: 'Aliaga' };
const TYPE_NAMES = { bulker: 'bulker', tanker: 'tanker', container: 'container' };

// ─── Helper: read price history ──────────────────────────────────────────────

function loadHistory() {
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveHistory(data) {
  fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2));
}

// ─── Show current prices ──────────────────────────────────────────────────────

async function showPrices() {
  const { rows } = await pool.query(
    `SELECT yard, country, vessel_type, price_usd_ldt, source, updated_at
     FROM scrap_prices ORDER BY country, vessel_type`
  );

  if (rows.length === 0) {
    console.log('No prices in DB. Run migrate_scrap_prices.sql first.');
    return;
  }

  const history = loadHistory();
  console.log('\n📊 Current Scrap Prices ($/LDT)\n');
  console.log('  Yard          Type        Price   Change  Source                Updated');
  console.log('  ─────────────────────────────────────────────────────────────────────────');

  for (const r of rows) {
    const key = `${r.yard}-${r.vessel_type}`;
    const prev = history[key]?.price;
    const change = prev ? ((r.price_usd_ldt - prev) / prev * 100).toFixed(1) : '—';
    const changeStr = prev
      ? (r.price_usd_ldt > prev ? `+${change}%` : `${change}%`).padStart(7)
      : '      —';
    const date = new Date(r.updated_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
    console.log(`  ${r.yard.padEnd(13)} ${r.vessel_type.padEnd(11)} $${String(r.price_usd_ldt).padEnd(6)} ${changeStr}  ${(r.source || '').padEnd(20)} ${date}`);
  }
  console.log();
}

// ─── Update single price ──────────────────────────────────────────────────────

async function setPrice(yard, type, price, source) {
  const yardName = YARD_NAMES[yard.toLowerCase()];
  const typeName = TYPE_NAMES[type.toLowerCase()];
  if (!yardName) { console.error(`Unknown yard: ${yard}. Use: chittagong, gadani, alang, aliaga`); process.exit(1); }
  if (!typeName) { console.error(`Unknown type: ${type}. Use: bulker, tanker, container`); process.exit(1); }
  const priceInt = parseInt(price);
  if (isNaN(priceInt)) { console.error(`Invalid price: ${price}`); process.exit(1); }

  // Save to history before updating
  const history = loadHistory();
  const key = `${yardName}-${typeName}`;
  const { rows: current } = await pool.query(
    `SELECT price_usd_ldt FROM scrap_prices WHERE yard = $1 AND vessel_type = $2`,
    [yardName, typeName]
  );
  if (current.length > 0) {
    history[key] = { price: current[0].price_usd_ldt, date: new Date().toISOString() };
    saveHistory(history);
  }

  const srcStr = source || `Manual ${new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}`;
  await pool.query(
    `UPDATE scrap_prices SET price_usd_ldt = $1, source = $2, updated_at = NOW()
     WHERE yard = $3 AND vessel_type = $4`,
    [priceInt, srcStr, yardName, typeName]
  );
  console.log(`✅ Updated ${yardName} ${typeName}: $${priceInt}/LDT (${srcStr})`);
}

// ─── Update all prices at once ────────────────────────────────────────────────

async function setAllPrices(source, prices) {
  // Expected order: chtg-bulker chtg-tanker chtg-cont gadani-bulker gadani-tanker gadani-cont alang-bulker alang-tanker alang-cont aliaga-bulker aliaga-tanker aliaga-cont
  const slots = [
    ['Chittagong','bulker'], ['Chittagong','tanker'], ['Chittagong','container'],
    ['Gadani','bulker'],     ['Gadani','tanker'],     ['Gadani','container'],
    ['Alang','bulker'],      ['Alang','tanker'],      ['Alang','container'],
    ['Aliaga','bulker'],     ['Aliaga','tanker'],     ['Aliaga','container'],
  ];

  if (prices.length !== slots.length) {
    console.error(`Expected ${slots.length} prices, got ${prices.length}`);
    console.error(`Order: chtg-bulker chtg-tanker chtg-cont gadani-bulker gadani-tanker gadani-cont alang-bulker alang-tanker alang-cont aliaga-bulker aliaga-tanker aliaga-cont`);
    process.exit(1);
  }

  // Snapshot history
  const history = loadHistory();
  const { rows: current } = await pool.query(`SELECT yard, vessel_type, price_usd_ldt FROM scrap_prices`);
  for (const r of current) {
    const key = `${r.yard}-${r.vessel_type}`;
    history[key] = { price: r.price_usd_ldt, date: new Date().toISOString() };
  }
  saveHistory(history);

  const srcStr = source || `Manual ${new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}`;
  for (let i = 0; i < slots.length; i++) {
    const [yard, type] = slots[i];
    const p = parseInt(prices[i]);
    if (isNaN(p)) { console.error(`Bad price at slot ${i}: ${prices[i]}`); process.exit(1); }
    await pool.query(
      `UPDATE scrap_prices SET price_usd_ldt = $1, source = $2, updated_at = NOW() WHERE yard = $3 AND vessel_type = $4`,
      [p, srcStr, yard, type]
    );
  }
  console.log(`✅ All 12 prices updated (${srcStr})`);
}

// ─── Price change alert ───────────────────────────────────────────────────────

async function sendAlert() {
  const { rows } = await pool.query(
    `SELECT yard, vessel_type, price_usd_ldt FROM scrap_prices`
  );
  const history = loadHistory();

  const changes = [];
  for (const r of rows) {
    const key = `${r.yard}-${r.vessel_type}`;
    const prev = history[key]?.price;
    if (!prev) continue;
    const pct = (r.price_usd_ldt - prev) / prev * 100;
    if (Math.abs(pct) >= 5) {
      changes.push({ yard: r.yard, type: r.vessel_type, prev, now: r.price_usd_ldt, pct });
    }
  }

  if (changes.length === 0) {
    console.log('No significant price changes (threshold: ±5%). No alert sent.');
    return;
  }

  console.log(`\n🚨 ${changes.length} significant price change(s) detected:`);
  for (const c of changes) {
    const dir = c.pct > 0 ? '▲' : '▼';
    console.log(`  ${dir} ${c.yard} ${c.type}: $${c.prev} → $${c.now} (${c.pct > 0 ? '+' : ''}${c.pct.toFixed(1)}%)`);
  }

  if (!RESEND_KEY) {
    console.log('\n⚠️  RESEND_API_KEY not set — skipping email alert');
    return;
  }

  const rows_html = changes.map(c => {
    const dir = c.pct > 0 ? '▲' : '▼';
    const color = c.pct > 0 ? '#15803D' : '#B91C1C';
    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB">${c.yard}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB">${c.type}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB">$${c.prev}/LDT</td>
      <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;font-weight:700;color:${color}">${dir} $${c.now}/LDT</td>
      <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;color:${color}">${c.pct > 0 ? '+' : ''}${c.pct.toFixed(1)}%</td>
    </tr>`;
  }).join('');

  const body = `
    <h2 style="font-family:sans-serif;color:#111827">🚢 ShipScout — Scrap Price Alert</h2>
    <p style="font-family:sans-serif;color:#374151">Significant price movements detected vs. last recorded prices:</p>
    <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;min-width:480px">
      <thead>
        <tr style="background:#F3F4F6">
          <th style="padding:8px 12px;text-align:left">Yard</th>
          <th style="padding:8px 12px;text-align:left">Type</th>
          <th style="padding:8px 12px;text-align:left">Previous</th>
          <th style="padding:8px 12px;text-align:left">Current</th>
          <th style="padding:8px 12px;text-align:left">Change</th>
        </tr>
      </thead>
      <tbody>${rows_html}</tbody>
    </table>
    <p style="font-family:sans-serif;color:#6B7280;font-size:12px;margin-top:24px">
      Update prices: <code>node scripts/updateScrapPrices.js --set YARD TYPE PRICE</code>
    </p>
  `;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'ShipScout <hello@shipscout.io>',
      to: ['ardavcioglu@gmail.com'],
      subject: `🚨 Scrap Price Alert — ${changes.length} significant change${changes.length > 1 ? 's' : ''}`,
      html: body,
    }),
  });

  if (res.ok) {
    console.log('\n✅ Alert email sent to ardavcioglu@gmail.com');
  } else {
    const err = await res.text();
    console.error('\n❌ Email failed:', err);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args[0] === '--set') {
    // --set YARD TYPE PRICE [SOURCE]
    const [, yard, type, price, ...srcParts] = args;
    if (!yard || !type || !price) {
      console.error('Usage: --set YARD TYPE PRICE [SOURCE]');
      process.exit(1);
    }
    await setPrice(yard, type, price, srcParts.join(' ') || '');
    await showPrices();

  } else if (args[0] === '--all') {
    // --all "SOURCE" p1 p2 p3 ... p12
    const [, source, ...prices] = args;
    await setAllPrices(source, prices);
    await showPrices();

  } else if (args[0] === '--alert') {
    await sendAlert();

  } else {
    await showPrices();
  }

  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
