/**
 * Rule-based outfit recommendation engine — 100% free, no API calls.
 * Covers 10+ style categories, 4 seasons, body-type-aware tips,
 * color theory, and gap analysis.
 */

interface DetectedItem {
  category: string;
  confidence: number;
  dominant_colors?: { color: string; hex: string; percentage: number }[];
}

interface BodyAttributes {
  person_detected: boolean;
  person_box?: { xmin: number; ymin: number; xmax: number; ymax: number } | null;
}

interface AnalysisData {
  clothing_items: DetectedItem[];
  style_classifications?: { label: string; confidence: number }[];
  body_attributes?: BodyAttributes;
  raw_segmentation_labels?: string[];
}

interface Recommendation {
  title: string;
  items: string[];
  reasoning: string;
  colorScheme: string;
}

// ─── Body type detection from bounding box ───────────────────────────

type BodyType = "rectangle" | "inverted_triangle" | "triangle" | "hourglass" | "oval" | "unknown";

function inferBodyType(attrs?: BodyAttributes): BodyType {
  if (!attrs?.person_detected || !attrs.person_box) return "unknown";
  const { xmin, ymin, xmax, ymax } = attrs.person_box;
  const w = xmax - xmin;
  const h = ymax - ymin;
  if (h === 0) return "unknown";
  const ratio = w / h;
  // Rough heuristics based on width-to-height ratio of person bounding box
  if (ratio > 0.55) return "oval";
  if (ratio > 0.45) return "rectangle";
  if (ratio > 0.38) return "inverted_triangle";
  if (ratio < 0.28) return "triangle";
  return "hourglass";
}

const BODY_TYPE_TIPS: Record<BodyType, string[]> = {
  rectangle: [
    "Create curves with belted jackets and wrap tops",
    "Peplum tops and flared skirts add definition at the waist",
    "Layering with different textures adds visual dimension",
    "A-line dresses and fit-and-flare silhouettes work beautifully",
  ],
  inverted_triangle: [
    "Balance broader shoulders with wider-leg pants or A-line skirts",
    "V-necklines elongate the torso and draw the eye downward",
    "Avoid heavy shoulder pads or puffed sleeves",
    "Dark tops with lighter bottoms create visual balance",
  ],
  triangle: [
    "Draw attention upward with statement necklaces and detailed necklines",
    "Structured shoulders and boat necks balance wider hips",
    "Dark-colored bottoms with brighter tops create proportion",
    "Straight-leg or bootcut pants balance the silhouette",
  ],
  hourglass: [
    "Emphasize your defined waist with fitted styles and belts",
    "Wrap dresses and tailored blazers highlight your natural shape",
    "Avoid boxy or overly loose silhouettes that hide your waist",
    "High-waisted bottoms accentuate your proportions",
  ],
  oval: [
    "Empire waist and A-line cuts flow elegantly over the midsection",
    "Vertical stripes and monochromatic outfits create a lengthening effect",
    "V-necklines and open collars elongate the torso",
    "Well-structured blazers with a single button give a streamlined look",
  ],
  unknown: [
    "Focus on fit — well-fitting clothes flatter every body type",
    "A tailored blazer is the most universally flattering piece",
    "Monochromatic outfits create a streamlined, elongated look",
  ],
};

// ─── Season detection from colors & clothing ─────────────────────────

type Season = "spring" | "summer" | "autumn" | "winter";

const WARM_COLORS = ["red", "orange", "yellow", "brown", "burgundy", "cream", "olive"];
const COOL_COLORS = ["blue", "navy", "teal", "purple", "indigo", "cyan", "mauve"];
const WARM_ITEMS = ["coat", "sweater", "hoodie", "jacket", "scarf", "boots", "cardigan"];
const COOL_ITEMS = ["shorts", "sandals", "tank_top", "sunglasses", "linen"];

function detectSeason(items: DetectedItem[], labels: string[]): Season {
  const all = [...labels, ...items.map(i => i.category)].map(l => l.toLowerCase().replace(/-/g, "_"));
  const warmScore = all.filter(l => WARM_ITEMS.some(w => l.includes(w))).length;
  const coolScore = all.filter(l => COOL_ITEMS.some(c => l.includes(c))).length;
  const colors = items.flatMap(i => (i.dominant_colors || []).map(c => c.color.toLowerCase()));
  const warmColorScore = colors.filter(c => WARM_COLORS.includes(c)).length;
  const coolColorScore = colors.filter(c => COOL_COLORS.includes(c)).length;

  const totalWarm = warmScore + warmColorScore;
  const totalCool = coolScore + coolColorScore;

  if (totalWarm > totalCool + 2) return all.some(l => l.includes("coat") || l.includes("scarf")) ? "winter" : "autumn";
  if (totalCool > totalWarm + 2) return all.some(l => l.includes("shorts") || l.includes("sandal")) ? "summer" : "spring";
  // Default based on month
  const month = new Date().getMonth();
  if (month >= 2 && month <= 4) return "spring";
  if (month >= 5 && month <= 7) return "summer";
  if (month >= 8 && month <= 10) return "autumn";
  return "winter";
}

const SEASONAL_TIPS: Record<Season, { palette: string; fabrics: string; essentials: string[] }> = {
  spring: {
    palette: "Pastels, soft greens, lavender, blush pink, sky blue",
    fabrics: "Lightweight cotton, linen blends, chambray, light denim",
    essentials: ["Light trench coat", "Floral blouse", "White sneakers", "Canvas tote", "Light-wash jeans"],
  },
  summer: {
    palette: "Bright whites, coral, turquoise, lemon yellow, mint",
    fabrics: "Linen, seersucker, chambray, breathable cotton, rayon",
    essentials: ["Linen shorts", "Breezy sundress", "Straw hat", "Espadrilles", "Lightweight sunglasses"],
  },
  autumn: {
    palette: "Rust, mustard, olive, burgundy, camel, burnt orange",
    fabrics: "Corduroy, flannel, wool blends, suede, knit",
    essentials: ["Camel overcoat", "Chunky knit sweater", "Chelsea boots", "Wool scarf", "Corduroy pants"],
  },
  winter: {
    palette: "Deep navy, charcoal, forest green, plum, ivory, black",
    fabrics: "Wool, cashmere, heavy denim, leather, velvet",
    essentials: ["Wool overcoat", "Cashmere sweater", "Leather boots", "Warm scarf & gloves", "Dark-wash jeans"],
  },
};

// ─── Color harmony ───────────────────────────────────────────────────

const COMPLEMENTARY: Record<string, string[]> = {
  red: ["green", "teal", "dark green", "olive"],
  blue: ["orange", "brown", "cream", "mustard"],
  green: ["red", "burgundy", "magenta", "pink"],
  yellow: ["purple", "indigo", "navy", "plum"],
  purple: ["yellow", "cream", "lime", "mustard"],
  orange: ["blue", "navy", "teal", "indigo"],
  navy: ["cream", "white", "orange", "camel"],
  black: ["white", "red", "cream", "gold"],
  white: ["navy", "black", "burgundy", "forest green"],
  brown: ["cream", "blue", "teal", "sky blue"],
  burgundy: ["cream", "navy", "white", "camel"],
  teal: ["cream", "brown", "red", "coral"],
  pink: ["navy", "dark green", "black", "charcoal"],
  olive: ["cream", "burgundy", "rust", "white"],
  "dark gray": ["white", "pink", "teal", "mustard"],
  "light gray": ["navy", "burgundy", "forest green", "coral"],
  cream: ["navy", "burgundy", "forest green", "brown"],
  cyan: ["coral", "rust", "brown", "burgundy"],
  indigo: ["gold", "cream", "coral", "mustard"],
  mauve: ["olive", "cream", "navy", "brown"],
};

const NEUTRAL_COLORS = ["black", "white", "dark gray", "light gray", "cream", "navy", "brown", "camel", "charcoal"];

// ─── Extended style categories ───────────────────────────────────────

const STYLE_OUTFITS: Record<string, Recommendation[]> = {
  casual: [
    { title: "Relaxed Weekend", items: ["Fitted t-shirt", "Slim jeans", "Clean sneakers", "Minimal watch"], reasoning: "Effortless and comfortable", colorScheme: "Earth tones" },
    { title: "Smart Casual", items: ["Oxford shirt (rolled sleeves)", "Chinos", "Loafers", "Leather belt"], reasoning: "Polished without trying too hard", colorScheme: "Navy + Khaki" },
    { title: "Laid-back Layers", items: ["Henley tee", "Open flannel shirt", "Straight-leg jeans", "Suede boots"], reasoning: "Textured and relaxed", colorScheme: "Warm neutrals" },
  ],
  formal: [
    { title: "Business Sharp", items: ["Tailored blazer", "Dress shirt", "Slim trousers", "Oxford shoes"], reasoning: "Professional and commanding", colorScheme: "Charcoal + White" },
    { title: "Evening Elegance", items: ["Dark suit", "Silk tie", "Pocket square", "Dress watch"], reasoning: "Classic sophistication", colorScheme: "Navy + Burgundy" },
    { title: "Power Meeting", items: ["Pinstripe suit", "French cuff shirt", "Cufflinks", "Cap-toe Oxfords"], reasoning: "Authority and confidence", colorScheme: "Dark grey + Silver" },
  ],
  streetwear: [
    { title: "Urban Edge", items: ["Oversized hoodie", "Cargo pants", "Chunky sneakers", "Crossbody bag"], reasoning: "Bold street style", colorScheme: "Black + Pops of color" },
    { title: "Retro Street", items: ["Vintage graphic tee", "Wide-leg jeans", "Retro runners", "Bucket hat"], reasoning: "90s-inspired cool", colorScheme: "Washed tones" },
    { title: "Techwear", items: ["Waterproof shell jacket", "Jogger pants", "Trail sneakers", "Utility vest"], reasoning: "Functional futurism", colorScheme: "Black + Neon accents" },
  ],
  minimalist: [
    { title: "Clean Lines", items: ["Structured tee", "Tailored trousers", "Minimal leather shoes", "Simple bracelet"], reasoning: "Less is more", colorScheme: "Monochrome" },
    { title: "Quiet Luxury", items: ["Cashmere crew neck", "Pressed wool trousers", "Suede loafers", "Leather card holder"], reasoning: "Understated elegance", colorScheme: "Camel + Cream + Grey" },
  ],
  bohemian: [
    { title: "Free Spirit", items: ["Flowy maxi dress", "Fringe bag", "Ankle boots", "Layered necklaces"], reasoning: "Effortlessly artistic", colorScheme: "Terracotta + Cream + Olive" },
    { title: "Festival Ready", items: ["Crochet top", "High-waisted denim shorts", "Gladiator sandals", "Wide-brim hat"], reasoning: "Fun and carefree", colorScheme: "Warm sunset tones" },
  ],
  athleisure: [
    { title: "Gym to Brunch", items: ["Performance joggers", "Fitted crop top or tank", "Clean trainers", "Zip-up hoodie"], reasoning: "Active but styled", colorScheme: "Grey + White + One accent" },
    { title: "Sport Luxe", items: ["Matching tracksuit set", "Chunky sneakers", "Baseball cap", "Minimal backpack"], reasoning: "Coordinated comfort", colorScheme: "Monochrome + Logo accent" },
  ],
  preppy: [
    { title: "Campus Classic", items: ["Cable-knit sweater", "Collared shirt underneath", "Pleated skirt or chinos", "Penny loafers"], reasoning: "Ivy League charm", colorScheme: "Navy + Red + White" },
    { title: "Country Club", items: ["Polo shirt", "Tailored shorts", "Boat shoes", "Woven belt"], reasoning: "Polished casual", colorScheme: "Pastel palette" },
  ],
  romantic: [
    { title: "Date Night", items: ["Silk blouse", "A-line midi skirt", "Strappy heels", "Delicate earrings"], reasoning: "Soft and alluring", colorScheme: "Blush + Champagne" },
    { title: "Garden Party", items: ["Floral wrap dress", "Kitten heels", "Clutch bag", "Pearl bracelet"], reasoning: "Feminine elegance", colorScheme: "Pastels + Florals" },
  ],
  edgy: [
    { title: "Rock & Roll", items: ["Leather jacket", "Band tee", "Skinny jeans", "Combat boots"], reasoning: "Rebellious attitude", colorScheme: "Black + Silver hardware" },
    { title: "Dark Avant-Garde", items: ["Asymmetric coat", "All-black layers", "Platform boots", "Statement rings"], reasoning: "Architectural drama", colorScheme: "All black + Texture contrast" },
  ],
  vintage: [
    { title: "Retro Glam", items: ["High-waisted wide-leg pants", "Tucked-in blouse", "Cat-eye sunglasses", "Scarf headband"], reasoning: "Old Hollywood charm", colorScheme: "Red + Black + Gold" },
    { title: "70s Revival", items: ["Corduroy flares", "Turtleneck sweater", "Platform shoes", "Oversized sunglasses"], reasoning: "Groovy throwback", colorScheme: "Mustard + Brown + Orange" },
  ],
  coastal: [
    { title: "Seaside Chic", items: ["Linen button-down", "Relaxed chinos", "Espadrilles", "Straw tote"], reasoning: "Breezy Mediterranean vibes", colorScheme: "White + Blue + Sand" },
    { title: "Beach to Bar", items: ["Linen shorts", "Camp collar shirt", "Leather sandals", "Woven bracelet"], reasoning: "Effortless warm-weather style", colorScheme: "Ocean blues + Warm neutrals" },
  ],
};

// ─── Style detection ─────────────────────────────────────────────────

function detectStyle(analysis: AnalysisData): string {
  const labels = (analysis.raw_segmentation_labels || []).map(l => l.toLowerCase());
  const styleLabels = (analysis.style_classifications || []).map(s => s.label.toLowerCase());
  const allLabels = [...labels, ...styleLabels];
  const joined = allLabels.join(" ");

  const styleKeywords: Record<string, string[]> = {
    formal: ["suit", "tuxedo", "blazer", "dress_shirt", "tie", "gown"],
    streetwear: ["hoodie", "jersey", "cargo", "sneaker", "cap", "military"],
    bohemian: ["fringe", "crochet", "floral", "boho", "maxi", "embroidered"],
    athleisure: ["sportswear", "jogger", "tracksuit", "athletic", "legging", "running"],
    preppy: ["polo", "argyle", "plaid", "loafer", "cardigan", "collar"],
    romantic: ["lace", "silk", "satin", "ruffle", "floral", "chiffon"],
    edgy: ["leather", "studs", "combat", "chain", "punk", "asymmetric"],
    vintage: ["retro", "vintage", "antique", "corduroy", "flare"],
    coastal: ["linen", "straw", "espadrille", "nautical", "stripe"],
    minimalist: ["minimal", "clean", "structured", "simple"],
  };

  let bestStyle = "casual";
  let bestScore = 0;

  for (const [style, keywords] of Object.entries(styleKeywords)) {
    const score = keywords.reduce((acc, kw) => acc + (joined.includes(kw) ? 1 : 0), 0);
    if (score > bestScore) { bestScore = score; bestStyle = style; }
  }

  // Fallback heuristics
  if (bestScore === 0) {
    if (labels.length <= 2 && labels.every(l => !l.includes("pattern"))) return "minimalist";
    if (labels.length > 5) return "streetwear";
  }

  return bestStyle;
}

// ─── Color recommendations ───────────────────────────────────────────

function getColorRecommendations(detectedColors: string[]): string[] {
  const suggestions = new Set<string>();
  for (const color of detectedColors) {
    const key = color.toLowerCase();
    const complements = COMPLEMENTARY[key];
    if (complements) complements.forEach(c => suggestions.add(c));
  }
  if (suggestions.size === 0) NEUTRAL_COLORS.forEach(c => suggestions.add(c));
  return Array.from(suggestions).slice(0, 6);
}

// ─── Gap analysis ────────────────────────────────────────────────────

function getCategoryGaps(detected: string[]): string[] {
  const normalized = detected.map(d => d.toLowerCase().replace(/[-\s]/g, "_"));
  const missing: string[] = [];

  const topWords = ["upper_body", "shirt", "top", "t_shirt", "jacket", "coat", "blazer", "sweater", "hoodie", "blouse", "tank_top", "cardigan"];
  const bottomWords = ["lower_body", "pants", "trousers", "skirt", "jeans", "shorts", "legging"];
  const shoeWords = ["shoes", "boots", "sneakers", "sandals", "heels", "loafers", "espadrilles"];
  const accWords = ["hat", "cap", "sunglasses", "scarf", "belt", "watch", "jewelry", "necklace", "bracelet", "earring"];
  const bagWords = ["bag", "handbag", "backpack", "clutch", "tote", "crossbody"];

  if (!normalized.some(d => topWords.some(w => d.includes(w)))) missing.push("a complementary top");
  if (!normalized.some(d => bottomWords.some(w => d.includes(w)))) missing.push("matching bottoms");
  if (!normalized.some(d => shoeWords.some(w => d.includes(w)))) missing.push("appropriate footwear");
  if (!normalized.some(d => bagWords.some(w => d.includes(w)))) missing.push("a stylish bag");
  if (!normalized.some(d => accWords.some(w => d.includes(w)))) missing.push("an accessory (jewelry, hat, or scarf)");

  return missing;
}

// ─── Main recommendation generator ──────────────────────────────────

export function generateRecommendations(analysis: AnalysisData): string {
  const style = detectStyle(analysis);
  const items = analysis.clothing_items || [];
  const labels = analysis.raw_segmentation_labels || [];
  const categories = items.map(i => i.category);
  const allColors = items.flatMap(i => (i.dominant_colors || []).map(c => c.color));
  const uniqueColors = [...new Set(allColors)];
  const bodyType = inferBodyType(analysis.body_attributes);
  const season = detectSeason(items, labels);
  const seasonInfo = SEASONAL_TIPS[season];

  const colorRecs = getColorRecommendations(uniqueColors);
  const gaps = getCategoryGaps(categories);
  const outfits = STYLE_OUTFITS[style] || STYLE_OUTFITS.casual;

  let md = `## 👗 Complete Style Analysis\n\n`;

  // ── Detected items
  md += `**Detected Style:** ${style.charAt(0).toUpperCase() + style.slice(1)}  \n`;
  md += `**Season Vibe:** ${season.charAt(0).toUpperCase() + season.slice(1)}  \n`;
  if (bodyType !== "unknown") {
    md += `**Body Shape:** ${bodyType.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}  \n`;
  }
  md += "\n";

  if (items.length > 0) {
    md += `### 🔍 Items Detected\n`;
    for (const item of items) {
      const colors = (item.dominant_colors || []).slice(0, 2).map(c => c.color).join(", ");
      md += `- **${item.category.replace(/_/g, " ")}** — ${Math.round(item.confidence * 100)}% confidence${colors ? ` — *${colors}*` : ""}\n`;
    }
    md += "\n";
  }

  // ── Color analysis
  if (uniqueColors.length > 0) {
    md += `### 🎨 Color Analysis\n`;
    md += `**Your Palette:** ${uniqueColors.slice(0, 5).join(", ")}  \n`;
    md += `**Complementary Colors:** ${colorRecs.join(", ")}  \n`;
    const isNeutralHeavy = uniqueColors.filter(c => NEUTRAL_COLORS.includes(c.toLowerCase())).length > uniqueColors.length / 2;
    if (isNeutralHeavy) {
      md += `> 💡 Your palette is neutral-heavy — a single bold accent color (like ${colorRecs.find(c => !NEUTRAL_COLORS.includes(c)) || "teal"}) can add visual interest.\n`;
    }
    md += "\n";
  }

  // ── Body type tips
  if (bodyType !== "unknown") {
    md += `### 🏋️ Body-Type Styling Tips\n`;
    const tips = BODY_TYPE_TIPS[bodyType];
    tips.forEach(tip => { md += `- ${tip}\n`; });
    md += "\n";
  }

  // ── Seasonal suggestions
  md += `### 🌤️ ${season.charAt(0).toUpperCase() + season.slice(1)} Style Guide\n`;
  md += `**Seasonal Palette:** ${seasonInfo.palette}  \n`;
  md += `**Best Fabrics:** ${seasonInfo.fabrics}  \n`;
  md += `**Season Essentials:**\n`;
  seasonInfo.essentials.forEach(e => { md += `- ${e}\n`; });
  md += "\n";

  // ── Missing pieces
  if (gaps.length > 0) {
    md += `### 🧩 Complete Your Look\n`;
    md += `Your outfit could benefit from: ${gaps.join(", ")}.\n\n`;
  }

  // ── Outfit recommendations
  md += `### ✨ Recommended Outfits\n\n`;
  for (const outfit of outfits) {
    md += `**${outfit.title}** — *${outfit.reasoning}*\n`;
    outfit.items.forEach(item => { md += `- ${item}\n`; });
    md += `- 🎨 Color scheme: ${outfit.colorScheme}\n\n`;
  }

  // ── Pro tips
  md += `### 💡 Pro Styling Tips\n`;
  if (uniqueColors.length > 3) {
    md += `- Too many colors? Stick to a **3-color rule** — one dominant, one secondary, one accent.\n`;
  }
  if (style === "casual") {
    md += `- Elevate casual instantly: swap sneakers for loafers, or add a structured blazer.\n`;
  }
  if (style === "formal") {
    md += `- The perfect fit is everything — get key pieces tailored for a 10x improvement.\n`;
  }
  if (style === "streetwear") {
    md += `- Balance oversized pieces: if the top is loose, keep bottoms slim (or vice versa).\n`;
  }
  md += `- **The rule of thirds:** break your outfit into visual thirds for natural balance.\n`;
  md += `- **One statement piece** + neutrals = effortless style every time.\n`;
  md += `- **Texture mixing** (e.g., knit + leather + denim) adds depth without extra color.\n`;

  return md;
}
