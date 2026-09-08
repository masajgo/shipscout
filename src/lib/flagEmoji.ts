const FLAG_ISO: Record<string, string> = {
  "Panama": "PA", "Marshall Islands": "MH", "Liberia": "LR", "Bahamas": "BS",
  "Malta": "MT", "Cyprus": "CY", "Greece": "GR", "Singapore": "SG",
  "China": "CN", "Hong Kong": "HK", "United Kingdom": "GB", "Norway": "NO",
  "Denmark": "DK", "Germany": "DE", "Japan": "JP", "South Korea": "KR",
  "Italy": "IT", "Turkey": "TR", "Antigua and Barbuda": "AG", "Bermuda": "BM",
  "Isle of Man": "IM", "Cayman Islands": "KY", "Tuvalu": "TV", "Palau": "PW",
  "Saint Kitts and Nevis": "KN", "Belize": "BZ", "Mongolia": "MN",
  "Cameroon": "CM", "Comoros": "KM", "Portugal": "PT", "Spain": "ES",
  "France": "FR", "Netherlands": "NL", "Belgium": "BE", "Sweden": "SE",
  "Finland": "FI", "Russia": "RU", "United States": "US", "Canada": "CA",
  "Brazil": "BR", "India": "IN", "United Arab Emirates": "AE", "Saudi Arabia": "SA",
  "Faroe Islands": "FO", "Gibraltar": "GI", "Saint Vincent and the Grenadines": "VC",
  "Barbados": "BB", "Cook Islands": "CK", "Vanuatu": "VU", "Cambodia": "KH",
  "Tanzania": "TZ", "Togo": "TG", "Gabon": "GA", "Kiribati": "KI",
  "Niue": "NU", "Samoa": "WS", "Dominica": "DM", "Philippines": "PH",
  "Indonesia": "ID", "Vietnam": "VN", "Thailand": "TH", "Myanmar": "MM",
  "Bangladesh": "BD", "Pakistan": "PK", "Iran": "IR", "Iraq": "IQ",
  "Kuwait": "KW", "Qatar": "QA", "Oman": "OM", "Bahrain": "BH",
  "Egypt": "EG", "Morocco": "MA", "Algeria": "DZ", "Tunisia": "TN",
  "Libya": "LY", "Nigeria": "NG", "Ghana": "GH", "Kenya": "KE",
  "South Africa": "ZA", "Mozambique": "MZ", "Madagascar": "MG",
  "Mauritius": "MU", "Seychelles": "SC", "Maldives": "MV",
  "Sri Lanka": "LK", "New Zealand": "NZ", "Australia": "AU",
  "Mexico": "MX", "Chile": "CL", "Peru": "PE", "Colombia": "CO",
  "Venezuela": "VE", "Argentina": "AR", "Ukraine": "UA", "Croatia": "HR",
  "Poland": "PL", "Romania": "RO", "Bulgaria": "BG", "Albania": "AL",
  "Azerbaijan": "AZ", "Georgia": "GE", "Kazakhstan": "KZ",
  "Madeira": "PT", "Kerguelen Islands": "FR",
};

function toEmoji(code: string): string {
  return [...code.toUpperCase()].map(c => String.fromCodePoint(c.charCodeAt(0) + 127397)).join("");
}

export function flagEmoji(country: string | null | undefined): string {
  if (!country) return "🏳";
  // Already an ISO alpha-2 code (e.g. "PA", "PT")
  if (/^[A-Za-z]{2}$/.test(country)) return toEmoji(country);
  // Full country name → look up ISO code
  const code = FLAG_ISO[country];
  if (!code) return "🏳";
  return toEmoji(code);
}
