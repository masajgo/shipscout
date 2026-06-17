const cron = require("node-cron");
const { fetchAllDistressedVessels } = require("./distressedVessels");
const { runWatcher } = require("./newsWatcher");

async function runScraper() {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`🕑 Scraper başladı: ${new Date().toISOString()}`);
  console.log("─".repeat(60));

  try {
    const vessels = await fetchAllDistressedVessels({ minScore: 20 });

    if (vessels.length === 0) {
      console.log("⚠️  Hiç gemi bulunamadı.");
      return;
    }

    console.log(`\n📊 TOP 10 HURDA ADAYI:`);
    console.log("IMO       | Ad                     | Bayrak        | Otorite         | Skor");
    console.log("─".repeat(80));
    vessels.slice(0, 10).forEach((v) => {
      const name = (v.name || "").substring(0, 22).padEnd(22);
      const flag = (v.flag || "").substring(0, 13).padEnd(13);
      const auth = (v.authority || "").substring(0, 15).padEnd(15);
      const imo = (v.imo || "N/A").padEnd(9);
      console.log(`${imo} | ${name} | ${flag} | ${auth} | ${v.scrapScore}`);
    });

    const alertCount = vessels.filter((v) => v.scrapScore >= 70).length;
    console.log(`\n🔔 ${alertCount} gemi alert eşiğini (70) geçti`);

    // İzlenen gemileri detention listesiyle cross-check et
    const watcherResult = await runWatcher(vessels);
    if (watcherResult.detentionAlerts > 0) {
      console.log(`🚨 ${watcherResult.detentionAlerts} izlenen gemi detention listesinde!`);
    }
    if (watcherResult.emailsReady > 0) {
      console.log(`📧 ${watcherResult.emailsReady} teklif emaili hazır`);
    }

    console.log(`✅ Scraper tamamlandı: ${new Date().toISOString()}\n`);

    return vessels;
  } catch (err) {
    console.error("❌ Scraper hatası:", err);
  }
}

// Her gece 02:00 UTC
const CRON_SCHEDULE = "0 2 * * *";

function startScheduler() {
  console.log(`📅 Scheduler başlatıldı — her gece 02:00 UTC`);
  cron.schedule(CRON_SCHEDULE, runScraper, {
    scheduled: true,
    timezone: "UTC",
  });

  if (process.env.RUN_ON_START === "true") {
    console.log("🚀 İlk çalışma başlatılıyor...");
    runScraper();
  }
}

if (require.main === module) {
  runScraper().then(() => {
    if (!process.env.KEEP_ALIVE) process.exit(0);
    else startScheduler();
  });
} else {
  module.exports = { startScheduler, runScraper };
}
