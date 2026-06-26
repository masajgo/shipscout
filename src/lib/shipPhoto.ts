"use server";

// Licensed ship photo finder — Wikimedia Commons + Flickr (if key present)
// Only returns photos with commercially usable, attributed licenses.

const WIKIMEDIA_API = "https://commons.wikimedia.org/w/api.php";
const UA            = "ShipScout/1.0 (https://shipscout.io) Next.js";
const FETCH_OPTS    = { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10_000) };

export interface LicensedPhoto {
  url:        string;       // full-resolution
  thumb:      string;       // ≤800px wide
  license:    string;       // e.g. "CC BY-SA 4.0"
  licenseUrl: string;       // link to license text
  author:     string;       // photographer name (HTML stripped)
  source:     "wikimedia" | "flickr";
  pageUrl:    string;       // Commons/Flickr page for attribution link
  attribution: string;      // ready-to-render "© Author / CC BY-SA 4.0"
}

// ─── License check ─────────────────────────────────────────────────────────

// Licenses that explicitly forbid commercial use or derivatives
const FORBIDDEN_RE = /\b(nc|nd|no.?deriv|non.?commercial|all.?rights.?reserved|no.?known.?license|copr\.?|©\s*[a-z])/i;

// Licenses that allow commercial use with attribution
const ALLOWED_RE   = /\b(cc.?by(?!.?nc)(?!.?nd)|cc0|public.?domain|pd|fal|free.?art|government.?work|no.?known.?copyright|unrestricted)/i;

function isCommercialOk(license: string): boolean {
  if (!license) return false;
  const l = license.toLowerCase().trim();
  if (FORBIDDEN_RE.test(l)) return false;
  return ALLOWED_RE.test(l) || l === "cc0" || l === "pd";
}

// ─── HTML strip ────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&#\d+;/g,"").trim();
}

// ─── Wikimedia Commons ─────────────────────────────────────────────────────

async function searchWikimedia(vesselName: string, imo: string): Promise<LicensedPhoto | null> {
  // Two search strategies: IMO number first (unique), then vessel name
  const queries = [
    `"IMO ${imo}"`,
    `${vesselName} ship`,
  ];

  for (const q of queries) {
    const searchUrl = `${WIKIMEDIA_API}?action=query&list=search&srsearch=${encodeURIComponent(q)}&srnamespace=6&srlimit=8&format=json&origin=*`;
    let titles: string[] = [];
    try {
      const r = await fetch(searchUrl, FETCH_OPTS);
      const j = await r.json() as { query?: { search?: { title: string }[] } };
      titles = j.query?.search?.map(s => s.title) ?? [];
    } catch { continue; }

    for (const title of titles) {
      const photo = await getWikimediaInfo(title);
      if (photo) return photo;
    }
  }
  return null;
}

async function getWikimediaInfo(fileTitle: string): Promise<LicensedPhoto | null> {
  const infoUrl = `${WIKIMEDIA_API}?action=query&titles=${encodeURIComponent(fileTitle)}&prop=imageinfo&iiprop=url%7Cextmetadata%7Csize&iiurlwidth=800&format=json&origin=*`;
  try {
    const r   = await fetch(infoUrl, FETCH_OPTS);
    const j   = await r.json() as Record<string, unknown>;
    const pages = (j as { query?: { pages?: Record<string, unknown> } }).query?.pages ?? {};
    const page  = Object.values(pages)[0] as Record<string, unknown> | undefined;
    if (!page || (page as { missing?: unknown }).missing !== undefined) return null;

    const ii   = ((page as { imageinfo?: unknown[] }).imageinfo ?? [])[0] as Record<string, unknown> | undefined;
    if (!ii) return null;

    const meta  = (ii as { extmetadata?: Record<string, { value: string }> }).extmetadata ?? {};
    const license   = meta.LicenseShortName?.value ?? meta.License?.value ?? "";
    const licenseUrl = meta.LicenseUrl?.value ?? "https://creativecommons.org/licenses/";
    const authorRaw  = meta.Artist?.value ?? meta.Credit?.value ?? "Unknown";
    const author     = stripHtml(authorRaw).slice(0, 120);
    const url        = (ii as { url?: string }).url ?? "";
    const thumbUrl   = (ii as { thumburl?: string }).thumburl ?? url;

    if (!url) return null;
    if (!isCommercialOk(license)) return null;
    // Skip non-image files
    if (!/\.(jpe?g|png|webp|gif)$/i.test(url)) return null;

    const pageUrl = `https://commons.wikimedia.org/wiki/${encodeURIComponent(fileTitle)}`;
    return {
      url, thumb: thumbUrl, license, licenseUrl, author, source: "wikimedia",
      pageUrl, attribution: `© ${author} / ${license}`,
    };
  } catch { return null; }
}

// ─── Flickr ────────────────────────────────────────────────────────────────

// Commercial-use license IDs in Flickr:
// 4=CC BY, 5=CC BY-SA, 7=No known copyright, 8=US Gov work, 9=CC0, 10=PD Mark
const FLICKR_COMMERCIAL_LICENSES = "4,5,7,8,9,10";

const FLICKR_LICENSE_MAP: Record<string, { name: string; url: string }> = {
  "4":  { name: "CC BY 2.0",     url: "https://creativecommons.org/licenses/by/2.0/" },
  "5":  { name: "CC BY-SA 2.0",  url: "https://creativecommons.org/licenses/by-sa/2.0/" },
  "7":  { name: "No known copyright restrictions", url: "https://www.flickr.com/commons/usage/" },
  "8":  { name: "US Government Work", url: "https://www.usa.gov/copyright" },
  "9":  { name: "CC0",           url: "https://creativecommons.org/publicdomain/zero/1.0/" },
  "10": { name: "Public Domain", url: "https://creativecommons.org/publicdomain/mark/1.0/" },
};

async function searchFlickr(vesselName: string, imo: string, apiKey: string): Promise<LicensedPhoto | null> {
  const queries = [`IMO ${imo}`, `${vesselName} ship`];

  for (const q of queries) {
    const url = `https://api.flickr.com/services/rest/?method=flickr.photos.search`
      + `&api_key=${apiKey}&text=${encodeURIComponent(q)}`
      + `&license=${FLICKR_COMMERCIAL_LICENSES}&sort=relevance&per_page=5`
      + `&extras=license,owner_name,url_m,url_l,url_c&format=json&nojsoncallback=1`;

    try {
      const r = await fetch(url, FETCH_OPTS);
      const j = await r.json() as { photos?: { photo?: FlickrPhoto[] } };
      const photos = j.photos?.photo ?? [];

      for (const p of photos) {
        const licInfo = FLICKR_LICENSE_MAP[String(p.license)];
        if (!licInfo) continue;
        const photoUrl  = p.url_l || p.url_c || p.url_m || "";
        if (!photoUrl) continue;
        const pageUrl = `https://www.flickr.com/photos/${p.owner}/${p.id}`;
        return {
          url:        photoUrl,
          thumb:      p.url_m || photoUrl,
          license:    licInfo.name,
          licenseUrl: licInfo.url,
          author:     p.ownername || "Unknown",
          source:     "flickr",
          pageUrl,
          attribution: `© ${p.ownername || "Unknown"} / ${licInfo.name}`,
        };
      }
    } catch { continue; }
  }
  return null;
}

interface FlickrPhoto {
  id: string; owner: string; ownername: string;
  license: string | number;
  url_m?: string; url_c?: string; url_l?: string;
}

// ─── Main entry ────────────────────────────────────────────────────────────

export async function findLicensedPhoto(
  vesselName: string,
  imo: string,
): Promise<LicensedPhoto | null> {
  // 1. Wikimedia Commons (no key needed)
  const wm = await searchWikimedia(vesselName, imo);
  if (wm) return wm;

  // 2. Flickr (only if key is configured)
  const flickrKey = process.env.FLICKR_API_KEY;
  if (flickrKey) {
    const fl = await searchFlickr(vesselName, imo, flickrKey);
    if (fl) return fl;
  }

  return null;
}
