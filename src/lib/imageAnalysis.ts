/**
 * Client-side image analysis — 100% free, no API calls.
 *
 * Divides the image into vertical zones (head, upper body, torso, lower body, feet)
 * and extracts multiple dominant colors from each zone using K-Means clustering.
 * Then infers garment types, style, season, color strategy, and generates
 * a rich structured analysis.
 */

// ─── Types ───────────────────────────────────────────────────────────

export interface SkinTone {
  category: "Fair" | "Medium" | "Wheatish" | "Brown" | "Dark";
  hex: string;
}

export interface OutfitItem {
  type: string;
  dominant_color: string;
  hex: string;
  confidence?: number;
  zone?: string;
  fit?: string;
  material_guess?: string;
  description?: string;
}

export interface AccessoryDetail {
  name: string;
  color?: string;
  description?: string;
}

export interface ColorPalette {
  primary_colors: string[];
  secondary_colors: string[];
  neutrals: string[];
  color_temperature: string;
  contrast_level: string;
}

export interface StructuredAnalysis {
  skin_tone: SkinTone;
  body_type: string;
  outfit: OutfitItem[];
  accessories: string[];
  // Extended fields
  outfit_type?: string;
  gender_expression?: string;
  season?: string;
  style_vibe?: string;
  color_strategy?: string;
  color_palette?: ColorPalette;
  style_tags?: string[];
  formality_score?: number;
  boldness_score?: number;
  layering_level?: string;
}

export interface UserIntent {
  occasion: string;
  useCurrentOutfit: boolean;
}

export interface FullAnalysisPayload {
  analysisData: StructuredAnalysis;
  userIntent: UserIntent;
  imageUrl?: string;
}

export interface RawAnalysis {
  skin_tone: SkinTone | null;
  body_type: string;
  outfit: { type: string; dominant_color: string | null; hex: string | null; confidence?: number }[];
  accessories: string[];
  clothing_items: any[];
  object_detections: any[];
  style_classifications: any[];
  body_attributes: {
    person_detected: boolean;
    person_box: { xmin: number; ymin: number; xmax: number; ymax: number } | null;
  };
  raw_segmentation_labels: string[];
  has_face_region: boolean;
  has_skin_region: boolean;
}

// ─── Color utilities ─────────────────────────────────────────────────

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function rgbToColorName(r: number, g: number, b: number): string {
  const [h, s, l] = rgbToHsl(r, g, b);
  if (l < 12) return "Black";
  if (l > 88 && s < 15) return "White";
  if (s < 10) return l < 50 ? "Dark Gray" : "Light Gray";
  if (h < 15 || h >= 345) return l < 40 ? "Dark Red" : s > 60 ? "Red" : "Pink";
  if (h < 25) return l < 35 ? "Maroon" : l < 50 ? "Brown" : "Orange";
  if (h < 40) return l < 40 ? "Brown" : "Orange";
  if (h < 55) return l > 70 ? "Cream" : l < 40 ? "Dark Yellow" : "Yellow";
  if (h < 80) return l < 40 ? "Olive" : "Lime Green";
  if (h < 150) return l < 30 ? "Dark Green" : l < 50 ? "Forest Green" : "Green";
  if (h < 190) return l < 40 ? "Teal" : "Cyan";
  if (h < 220) return l < 30 ? "Dark Blue" : l < 45 ? "Navy" : "Blue";
  if (h < 260) return l < 30 ? "Dark Blue" : l < 45 ? "Navy" : "Royal Blue";
  if (h < 290) return l < 40 ? "Indigo" : "Purple";
  if (h < 320) return l < 40 ? "Plum" : s > 50 ? "Magenta" : "Mauve";
  if (h < 345) return l < 40 ? "Burgundy" : s > 50 ? "Hot Pink" : "Rose";
  return "Red";
}

function classifySkinTone(r: number, g: number, b: number): SkinTone {
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  const hex = rgbToHex(r, g, b);
  if (luminance > 200) return { category: "Fair", hex };
  if (luminance > 170) return { category: "Medium", hex };
  if (luminance > 140) return { category: "Wheatish", hex };
  if (luminance > 100) return { category: "Brown", hex };
  return { category: "Dark", hex };
}

// ─── K-Means clustering ─────────────────────────────────────────────

function simpleKMeans(pixels: number[][], k: number, iterations = 10): number[][] {
  if (pixels.length < k) return pixels;
  const step = Math.max(1, Math.floor(pixels.length / k));
  let centroids = Array.from({ length: k }, (_, i) => [
    ...pixels[Math.min(i * step, pixels.length - 1)],
  ]);
  for (let iter = 0; iter < iterations; iter++) {
    const clusters: number[][][] = Array.from({ length: k }, () => []);
    for (const px of pixels) {
      let minDist = Infinity, minIdx = 0;
      for (let j = 0; j < k; j++) {
        const d = (px[0] - centroids[j][0]) ** 2 + (px[1] - centroids[j][1]) ** 2 + (px[2] - centroids[j][2]) ** 2;
        if (d < minDist) { minDist = d; minIdx = j; }
      }
      clusters[minIdx].push(px);
    }
    centroids = clusters.map((cluster, i) => {
      if (cluster.length === 0) return centroids[i];
      const avg = [0, 0, 0];
      for (const px of cluster) { avg[0] += px[0]; avg[1] += px[1]; avg[2] += px[2]; }
      return avg.map((v) => Math.round(v / cluster.length));
    });
  }
  return centroids;
}

interface ZoneColor {
  color: string;
  hex: string;
  r: number;
  g: number;
  b: number;
  percentage: number;
}

function extractZoneColors(
  ctx: CanvasRenderingContext2D,
  imgW: number,
  imgH: number,
  x: number,
  y: number,
  w: number,
  h: number,
  k = 3
): ZoneColor[] {
  const clamped = {
    x: Math.max(0, Math.min(x, imgW - 1)),
    y: Math.max(0, Math.min(y, imgH - 1)),
    w: Math.max(1, Math.min(w, imgW - x)),
    h: Math.max(1, Math.min(h, imgH - y)),
  };
  const data = ctx.getImageData(clamped.x, clamped.y, clamped.w, clamped.h).data;
  const pixels: number[][] = [];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    pixels.push([data[i], data[i + 1], data[i + 2]]);
  }
  if (pixels.length === 0) return [];

  const centroids = simpleKMeans(pixels, k);
  const counts = new Array(centroids.length).fill(0);
  for (const px of pixels) {
    let minDist = Infinity, minIdx = 0;
    for (let j = 0; j < centroids.length; j++) {
      const d = (px[0] - centroids[j][0]) ** 2 + (px[1] - centroids[j][1]) ** 2 + (px[2] - centroids[j][2]) ** 2;
      if (d < minDist) { minDist = d; minIdx = j; }
    }
    counts[minIdx]++;
  }

  return centroids
    .map((c, i) => ({
      color: rgbToColorName(c[0], c[1], c[2]),
      hex: rgbToHex(c[0], c[1], c[2]),
      r: c[0], g: c[1], b: c[2],
      percentage: (counts[i] / pixels.length) * 100,
    }))
    .sort((a, b) => b.percentage - a.percentage);
}

// ─── Skin tone extraction ────────────────────────────────────────────

export function extractSkinTone(
  imageSrc: string,
  personBox?: { xmin: number; ymin: number; xmax: number; ymax: number } | null
): Promise<SkinTone> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve({ category: "Medium", hex: "#C68642" }); return; }
      ctx.drawImage(img, 0, 0);

      let sampleX: number, sampleY: number, sampleW: number, sampleH: number;
      if (personBox) {
        const px = personBox.xmin, py = personBox.ymin;
        const pw = personBox.xmax - personBox.xmin, ph = personBox.ymax - personBox.ymin;
        sampleX = Math.round(px + pw * 0.3);
        sampleY = Math.round(py);
        sampleW = Math.round(pw * 0.4);
        sampleH = Math.round(ph * 0.2);
      } else {
        sampleX = Math.round(w * 0.3);
        sampleY = Math.round(h * 0.02);
        sampleW = Math.round(w * 0.4);
        sampleH = Math.round(h * 0.18);
      }
      sampleX = Math.max(0, Math.min(sampleX, w - 1));
      sampleY = Math.max(0, Math.min(sampleY, h - 1));
      sampleW = Math.max(1, Math.min(sampleW, w - sampleX));
      sampleH = Math.max(1, Math.min(sampleH, h - sampleY));

      const imageData = ctx.getImageData(sampleX, sampleY, sampleW, sampleH);
      const data = imageData.data;
      let totalR = 0, totalG = 0, totalB = 0, count = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        if (r > 60 && g > 40 && b > 20 && r > b && (r - g) < 100 && r < 250) {
          totalR += r; totalG += g; totalB += b; count++;
        }
      }
      if (count > 0) {
        resolve(classifySkinTone(Math.round(totalR / count), Math.round(totalG / count), Math.round(totalB / count)));
      } else {
        let tR = 0, tG = 0, tB = 0, n = 0;
        for (let i = 0; i < data.length; i += 4) { tR += data[i]; tG += data[i + 1]; tB += data[i + 2]; n++; }
        resolve(n > 0 ? classifySkinTone(Math.round(tR / n), Math.round(tG / n), Math.round(tB / n)) : { category: "Medium", hex: "#C68642" });
      }
    };
    img.onerror = () => resolve({ category: "Medium", hex: "#C68642" });
    img.src = imageSrc;
  });
}

// ─── Zone definitions ────────────────────────────────────────────────

interface ImageZone {
  name: string;
  yStart: number; // fraction of image height
  yEnd: number;
  xStart: number;
  xEnd: number;
  garmentType: string;
  possibleItems: string[];
}

const IMAGE_ZONES: ImageZone[] = [
  {
    name: "head_accessories",
    yStart: 0, yEnd: 0.12,
    xStart: 0.2, xEnd: 0.8,
    garmentType: "Headwear / Accessories",
    possibleItems: ["Hat", "Cap", "Beanie", "Headband", "Sunglasses", "Hair Accessory"],
  },
  {
    name: "upper_body",
    yStart: 0.12, yEnd: 0.35,
    xStart: 0.15, xEnd: 0.85,
    garmentType: "Outerwear / Top Layer",
    possibleItems: ["Blazer", "Jacket", "Coat", "Overcoat", "Cardigan", "Vest", "Shirt", "Sweater"],
  },
  {
    name: "mid_body",
    yStart: 0.30, yEnd: 0.55,
    xStart: 0.15, xEnd: 0.85,
    garmentType: "Shirt / Mid Layer",
    possibleItems: ["Button-Up Shirt", "T-Shirt", "Blouse", "Tank Top", "Polo", "Dress (upper half)", "Hoodie", "Kurta"],
  },
  {
    name: "waist_accessories",
    yStart: 0.45, yEnd: 0.55,
    xStart: 0.2, xEnd: 0.8,
    garmentType: "Belt / Waist Accessory",
    possibleItems: ["Belt", "Sash", "Waist Chain"],
  },
  {
    name: "lower_body",
    yStart: 0.50, yEnd: 0.80,
    xStart: 0.15, xEnd: 0.85,
    garmentType: "Bottoms",
    possibleItems: ["Trousers", "Jeans", "Chinos", "Skirt", "Shorts", "Joggers", "Leggings", "Dress (lower half)"],
  },
  {
    name: "footwear",
    yStart: 0.80, yEnd: 1.0,
    xStart: 0.15, xEnd: 0.85,
    garmentType: "Footwear",
    possibleItems: ["Sneakers", "Boots", "Loafers", "Sandals", "Heels", "Oxford Shoes", "Combat Boots", "Espadrilles"],
  },
  {
    name: "left_hand",
    yStart: 0.35, yEnd: 0.60,
    xStart: 0, xEnd: 0.2,
    garmentType: "Hand Accessory",
    possibleItems: ["Watch", "Bracelet", "Ring", "Bag", "Clutch"],
  },
  {
    name: "right_hand",
    yStart: 0.35, yEnd: 0.60,
    xStart: 0.8, xEnd: 1.0,
    garmentType: "Hand Accessory",
    possibleItems: ["Watch", "Bracelet", "Ring", "Bag", "Clutch"],
  },
];

// ─── Garment inference from zone colors ──────────────────────────────

const WARM_COLORS = new Set(["red", "dark red", "maroon", "orange", "brown", "burgundy", "cream", "olive", "hot pink", "rose", "plum"]);
const COOL_COLORS = new Set(["blue", "navy", "dark blue", "royal blue", "teal", "purple", "indigo", "cyan", "mauve"]);
const NEUTRAL_COLORS = new Set(["black", "white", "dark gray", "light gray", "cream", "brown"]);

function guessGarmentFromColor(zoneName: string, primaryColor: string, secondaryColors: string[]): {
  type: string;
  fit: string;
  material: string;
  description: string;
} {
  const color = primaryColor.toLowerCase();
  const hasPattern = secondaryColors.length > 1 &&
    secondaryColors.some(c => c.toLowerCase() !== color);

  switch (zoneName) {
    case "upper_body": {
      if (["black", "dark gray", "navy", "dark blue"].includes(color))
        return { type: "Structured Blazer / Coat", fit: "Tailored, structured shoulders", material: "Wool blend", description: `A refined ${primaryColor} outer layer with a polished silhouette.` };
      if (["burgundy", "dark red", "maroon", "plum"].includes(color))
        return { type: "Long Blazer / Overcoat", fit: "Tailored, statement piece", material: "Wool blend", description: `A bold ${primaryColor} outerwear piece that commands attention. 🔥` };
      if (hasPattern)
        return { type: "Patterned Jacket", fit: "Regular to slim", material: "Cotton or synthetic blend", description: `An eye-catching patterned outer layer in ${primaryColor} tones.` };
      return { type: "Jacket / Blazer", fit: "Regular", material: "Cotton blend", description: `A ${primaryColor} outer layer providing structure to the look.` };
    }
    case "mid_body": {
      if (hasPattern)
        return { type: "Printed Shirt", fit: "Slim to regular", material: "Cotton or silk blend", description: `A statement ${primaryColor} shirt with ${secondaryColors.slice(0, 3).join(", ")} accents. This piece does the heavy lifting in this outfit. 🎨` };
      if (["white", "light gray", "cream"].includes(color))
        return { type: "Dress Shirt", fit: "Slim, clean lines", material: "Cotton poplin", description: `A crisp ${primaryColor} shirt — timeless and versatile.` };
      return { type: "Button-Up Shirt / Top", fit: "Regular", material: "Cotton", description: `A solid ${primaryColor} top anchoring the midsection.` };
    }
    case "lower_body": {
      if (["navy", "dark blue", "indigo", "blue"].includes(color))
        return { type: "Tailored Trousers / Jeans", fit: "Slim / Straight", material: "Denim or wool blend", description: `${primaryColor} bottoms providing a strong foundation.` };
      if (["forest green", "dark green", "olive"].includes(color))
        return { type: "Tailored Trousers", fit: "Slim / Straight tailored", material: "Wool blend or structured cotton", description: `Deep ${primaryColor} trousers — unexpected and sophisticated.` };
      if (["black", "dark gray"].includes(color))
        return { type: "Formal Trousers", fit: "Tailored slim", material: "Wool blend", description: `Classic ${primaryColor} trousers for a sharp, grounded look.` };
      if (["cream", "white", "light gray"].includes(color))
        return { type: "Chinos / Light Trousers", fit: "Relaxed to regular", material: "Cotton twill", description: `Light ${primaryColor} bottoms adding airiness to the outfit.` };
      return { type: "Trousers / Pants", fit: "Regular", material: "Cotton blend", description: `${primaryColor} bottoms completing the lower half.` };
    }
    case "footwear": {
      if (["red", "dark red", "hot pink"].includes(color))
        return { type: "Statement Boots", fit: "Ankle height", material: "Leather", description: `Bright ${primaryColor} boots — these are not asking for permission. They are announcing themselves. 🔥` };
      if (["black", "dark gray"].includes(color))
        return { type: "Leather Boots / Shoes", fit: "Standard", material: "Leather", description: `Classic ${primaryColor} footwear grounding the entire look.` };
      if (["white", "light gray"].includes(color))
        return { type: "Clean Sneakers", fit: "Low-top", material: "Leather or canvas", description: `Fresh ${primaryColor} sneakers keeping things casual and clean.` };
      if (["brown"].includes(color))
        return { type: "Leather Shoes / Boots", fit: "Standard", material: "Leather", description: `Warm ${primaryColor} leather footwear adding a classic touch.` };
      return { type: "Shoes", fit: "Standard", material: "Mixed", description: `${primaryColor} footwear completing the look from the ground up.` };
    }
    case "head_accessories":
      return { type: "Headwear / Hair", fit: "N/A", material: "Mixed", description: `${primaryColor} headwear or hair region detected.` };
    case "waist_accessories":
      return { type: "Belt / Waist Accessory", fit: "Standard", material: "Leather", description: `A ${primaryColor} belt or waist accessory adding structure.` };
    case "left_hand":
    case "right_hand":
      return { type: "Bag / Wrist Accessory", fit: "N/A", material: "Leather", description: `A ${primaryColor} hand accessory or bag detected.` };
    default:
      return { type: "Clothing Item", fit: "Unknown", material: "Unknown", description: `${primaryColor} item detected.` };
  }
}

// ─── Style classification ────────────────────────────────────────────

function classifyOutfitStyle(items: OutfitItem[], allColors: string[]): {
  outfitType: string;
  styleVibe: string;
  colorStrategy: string;
  genderExpression: string;
  formality: number;
  boldness: number;
  layering: string;
  tags: string[];
} {
  const hasStructured = items.some(i => i.type?.toLowerCase().includes("blazer") || i.type?.toLowerCase().includes("tailored") || i.type?.toLowerCase().includes("coat"));
  const hasCasual = items.some(i => i.type?.toLowerCase().includes("t-shirt") || i.type?.toLowerCase().includes("sneaker") || i.type?.toLowerCase().includes("hoodie") || i.type?.toLowerCase().includes("jeans"));
  const hasEdgy = items.some(i => i.type?.toLowerCase().includes("combat") || i.type?.toLowerCase().includes("statement") || i.type?.toLowerCase().includes("leather"));
  const hasPattern = items.some(i => i.type?.toLowerCase().includes("pattern") || i.type?.toLowerCase().includes("printed"));

  const warmCount = allColors.filter(c => WARM_COLORS.has(c.toLowerCase())).length;
  const coolCount = allColors.filter(c => COOL_COLORS.has(c.toLowerCase())).length;
  const neutralCount = allColors.filter(c => NEUTRAL_COLORS.has(c.toLowerCase())).length;
  const totalDistinct = new Set(allColors.map(c => c.toLowerCase())).size;

  // Color strategy
  let colorStrategy = "Neutral";
  if (warmCount > 0 && coolCount > 0) colorStrategy = "Complementary + Mixed Temperature";
  else if (warmCount > coolCount) colorStrategy = "Warm Tones";
  else if (coolCount > warmCount) colorStrategy = "Cool Tones";
  if (totalDistinct >= 4) colorStrategy += " + Multi-Color";
  if (neutralCount > totalDistinct / 2) colorStrategy = "Neutral-Dominant";

  // Style classification
  let outfitType = "Casual";
  if (hasStructured && hasCasual) outfitType = "Smart Casual";
  else if (hasStructured && hasEdgy) outfitType = "Creative Formal / Statement";
  else if (hasStructured) outfitType = "Formal / Business";
  else if (hasEdgy) outfitType = "Edgy / Street-Luxe";
  if (hasPattern) outfitType += " / Artistic";

  // Season guess
  const itemTypes = items.map(i => i.type?.toLowerCase() || "");
  const hasHeavy = itemTypes.some(t => t.includes("coat") || t.includes("blazer") || t.includes("boot") || t.includes("sweater"));
  const hasLight = itemTypes.some(t => t.includes("sandal") || t.includes("tank") || t.includes("shorts"));

  // Formality & boldness
  let formality = 5;
  if (hasStructured) formality += 2;
  if (hasCasual) formality -= 1;
  if (hasEdgy) formality -= 1;
  formality = Math.max(1, Math.min(10, formality));

  let boldness = 3;
  if (hasEdgy) boldness += 2;
  if (hasPattern) boldness += 2;
  if (totalDistinct >= 4) boldness += 2;
  if (warmCount > 2) boldness += 1;
  boldness = Math.max(1, Math.min(10, boldness));

  const layering = items.filter(i =>
    !["belt", "bag", "watch", "headwear", "hair"].some(a => i.type?.toLowerCase().includes(a))
  ).length >= 3 ? "Heavy Layering" : items.length >= 2 ? "Moderate" : "Minimal";

  // Tags
  const tags: string[] = [];
  if (hasStructured) tags.push("structured", "polished");
  if (hasCasual) tags.push("relaxed", "everyday");
  if (hasEdgy) tags.push("edgy", "statement-piece");
  if (hasPattern) tags.push("artistic", "pattern-play");
  if (boldness >= 7) tags.push("bold", "high-contrast");
  if (formality >= 7) tags.push("formal", "refined");
  if (hasHeavy) tags.push("winter-layered", "cold-weather");
  if (hasLight) tags.push("summer-ready", "breathable");
  if (totalDistinct >= 4) tags.push("multi-color", "creative");
  if (neutralCount > 2) tags.push("neutral-palette", "minimalist");
  tags.push("curated");

  const styleVibe = [
    boldness >= 7 ? "Bold" : boldness >= 4 ? "Balanced" : "Subtle",
    hasPattern ? "Artistic" : hasStructured ? "Refined" : "Relaxed",
    warmCount > coolCount ? "Warm-Toned" : coolCount > warmCount ? "Cool-Toned" : "Neutral",
  ].join(", ");

  const genderExpression = hasStructured
    ? "Structured / Tailored fit"
    : hasCasual
    ? "Relaxed / Unisex-leaning"
    : "Versatile";

  return { outfitType, styleVibe, colorStrategy, genderExpression, formality, boldness, layering, tags };
}

// ─── Season detection ────────────────────────────────────────────────

function detectSeason(items: OutfitItem[]): string {
  const types = items.map(i => (i.type || "").toLowerCase());
  const hasWinter = types.some(t => t.includes("coat") || t.includes("blazer") || t.includes("boot") || t.includes("sweater") || t.includes("scarf"));
  const hasSummer = types.some(t => t.includes("sandal") || t.includes("tank") || t.includes("shorts") || t.includes("linen"));
  if (hasWinter && !hasSummer) return "Fall / Winter";
  if (hasSummer && !hasWinter) return "Spring / Summer";
  const month = new Date().getMonth();
  if (month >= 3 && month <= 8) return "Spring / Summer";
  return "Fall / Winter";
}

// ─── Accessory detection from zones ──────────────────────────────────

function detectAccessoriesFromZones(
  zoneResults: Map<string, ZoneColor[]>,
  items: OutfitItem[]
): string[] {
  const accessories: string[] = [];

  const waistColors = zoneResults.get("waist_accessories") || [];
  if (waistColors.length > 0) {
    const dominant = waistColors[0];
    if (dominant.percentage > 5) {
      accessories.push(`Belt (${dominant.color})`);
    }
  }

  const leftHand = zoneResults.get("left_hand") || [];
  const rightHand = zoneResults.get("right_hand") || [];
  if (leftHand.length > 0 || rightHand.length > 0) {
    const handColors = [...leftHand, ...rightHand];
    const distinct = new Set(handColors.map(c => c.color));
    if (distinct.size > 1) {
      accessories.push("Wrist Accessory / Watch");
    }
    if (handColors.some(c => c.color.toLowerCase().includes("black") || c.color.toLowerCase().includes("brown"))) {
      accessories.push("Bag / Crossbody");
    }
  }

  const head = zoneResults.get("head_accessories") || [];
  if (head.length > 0 && head.some(c => c.percentage > 10 && !c.color.toLowerCase().includes("black"))) {
    accessories.push("Headwear");
  }

  // Default accessories guesses if outfit seems formal/complete
  if (accessories.length === 0 && items.length >= 3) {
    accessories.push("Likely: Watch, Belt");
  }

  return accessories;
}

// ─── MAIN: Full client-side analysis ─────────────────────────────────

export function extractRegionColor(
  imageSrc: string,
  regionPct?: { x: number; y: number; w: number; h: number }
): Promise<{ color: string; hex: string }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const size = 80;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve({ color: "Unknown", hex: "#808080" }); return; }

      if (regionPct) {
        const sx = Math.round(regionPct.x * img.naturalWidth);
        const sy = Math.round(regionPct.y * img.naturalHeight);
        const sw = Math.round(regionPct.w * img.naturalWidth);
        const sh = Math.round(regionPct.h * img.naturalHeight);
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
      } else {
        const sx = Math.round(img.naturalWidth * 0.2);
        const sy = Math.round(img.naturalHeight * 0.25);
        const sw = Math.round(img.naturalWidth * 0.6);
        const sh = Math.round(img.naturalHeight * 0.5);
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
      }

      const data = ctx.getImageData(0, 0, size, size).data;
      const pixels: number[][] = [];
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 128) continue;
        pixels.push([data[i], data[i + 1], data[i + 2]]);
      }
      if (pixels.length === 0) { resolve({ color: "Unknown", hex: "#808080" }); return; }

      const centroids = simpleKMeans(pixels, 3);
      const counts = new Array(centroids.length).fill(0);
      for (const px of pixels) {
        let minDist = Infinity, minIdx = 0;
        for (let j = 0; j < centroids.length; j++) {
          const d = (px[0] - centroids[j][0]) ** 2 + (px[1] - centroids[j][1]) ** 2 + (px[2] - centroids[j][2]) ** 2;
          if (d < minDist) { minDist = d; minIdx = j; }
        }
        counts[minIdx]++;
      }
      let bestIdx = 0, bestCount = 0;
      for (let i = 0; i < centroids.length; i++) {
        const [r, g, b] = centroids[i];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const isSkinLike = r > 150 && g > 100 && b > 70 && r > b && (r - g) < 60;
        const skipFactor = (lum > 240 || isSkinLike) ? 0.3 : 1;
        const adjustedCount = counts[i] * skipFactor;
        if (adjustedCount > bestCount) { bestCount = adjustedCount; bestIdx = i; }
      }
      const [r, g, b] = centroids[bestIdx];
      resolve({ color: rgbToColorName(r, g, b), hex: rgbToHex(r, g, b) });
    };
    img.onerror = () => resolve({ color: "Unknown", hex: "#808080" });
    img.src = imageSrc;
  });
}

/**
 * Full multi-zone client-side image analysis.
 * Splits the image into zones, extracts colors, infers garments, and builds
 * a rich structured analysis — all without any API calls.
 */
export function runFullClientAnalysis(imageSrc: string): Promise<StructuredAnalysis> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(fallbackAnalysis());
        return;
      }
      ctx.drawImage(img, 0, 0);

      // 1. Extract skin tone from head region
      const headData = ctx.getImageData(
        Math.round(w * 0.3), Math.round(h * 0.02),
        Math.round(w * 0.4), Math.round(h * 0.15)
      ).data;
      let sR = 0, sG = 0, sB = 0, sCount = 0;
      for (let i = 0; i < headData.length; i += 4) {
        const r = headData[i], g = headData[i + 1], b = headData[i + 2];
        if (r > 60 && g > 40 && b > 20 && r > b && (r - g) < 100 && r < 250) {
          sR += r; sG += g; sB += b; sCount++;
        }
      }
      const skinTone = sCount > 0
        ? classifySkinTone(Math.round(sR / sCount), Math.round(sG / sCount), Math.round(sB / sCount))
        : { category: "Medium" as const, hex: "#C68642" };

      // 2. Extract colors from each zone
      const zoneResults = new Map<string, ZoneColor[]>();
      const outfitItems: OutfitItem[] = [];
      const allDetectedColors: string[] = [];

      const mainZones = ["upper_body", "mid_body", "lower_body", "footwear"];

      for (const zone of IMAGE_ZONES) {
        const zx = Math.round(zone.xStart * w);
        const zy = Math.round(zone.yStart * h);
        const zw = Math.round((zone.xEnd - zone.xStart) * w);
        const zh = Math.round((zone.yEnd - zone.yStart) * h);

        const colors = extractZoneColors(ctx, w, h, zx, zy, zw, zh, 4);
        zoneResults.set(zone.name, colors);

        // Only create outfit items for main clothing zones
        if (mainZones.includes(zone.name) && colors.length > 0) {
          // Filter out skin-like colors
          const clothingColors = colors.filter(c => {
            const isSkinLike = c.r > 150 && c.g > 100 && c.b > 70 && c.r > c.b && (c.r - c.g) < 60;
            const isBackground = (c.r > 240 && c.g > 240 && c.b > 240);
            return !isSkinLike && !isBackground && c.percentage > 8;
          });

          if (clothingColors.length > 0) {
            const primary = clothingColors[0];
            const secondary = clothingColors.slice(1).map(c => c.color);
            const garment = guessGarmentFromColor(zone.name, primary.color, secondary);
            allDetectedColors.push(primary.color, ...secondary);

            outfitItems.push({
              type: garment.type,
              dominant_color: primary.color,
              hex: primary.hex,
              confidence: primary.percentage / 100,
              zone: zone.garmentType,
              fit: garment.fit,
              material_guess: garment.material,
              description: garment.description,
            });
          }
        }
      }

      // 3. Detect accessories
      const accessories = detectAccessoriesFromZones(zoneResults, outfitItems);

      // 4. Body type from aspect ratio
      const aspectRatio = w / h;
      let bodyType = "Average Build";
      if (aspectRatio < 0.4) bodyType = "Tall / Slim";
      else if (aspectRatio < 0.55) bodyType = "Athletic / Proportional";
      else if (aspectRatio < 0.7) bodyType = "Average Build";
      else bodyType = "Broad / Stocky";

      // 5. Style classification
      const styleInfo = classifyOutfitStyle(outfitItems, allDetectedColors);
      const season = detectSeason(outfitItems);

      // 6. Build color palette
      const uniqueColors = [...new Set(allDetectedColors.map(c => c.toLowerCase()))];
      const primaryColors = uniqueColors.filter(c => !NEUTRAL_COLORS.has(c)).slice(0, 3);
      const secondaryColors = uniqueColors.filter(c => !NEUTRAL_COLORS.has(c)).slice(3, 6);
      const neutrals = uniqueColors.filter(c => NEUTRAL_COLORS.has(c));

      const colorPalette: ColorPalette = {
        primary_colors: primaryColors.length > 0 ? primaryColors : ["not clearly detected"],
        secondary_colors: secondaryColors,
        neutrals,
        color_temperature: styleInfo.colorStrategy.includes("Warm") ? "Warm" :
          styleInfo.colorStrategy.includes("Cool") ? "Cool" : "Mixed (warm + cool contrast)",
        contrast_level: styleInfo.boldness >= 7 ? "High" : styleInfo.boldness >= 4 ? "Medium" : "Low",
      };

      resolve({
        skin_tone: skinTone,
        body_type: bodyType,
        outfit: outfitItems,
        accessories,
        outfit_type: styleInfo.outfitType,
        gender_expression: styleInfo.genderExpression,
        season,
        style_vibe: styleInfo.styleVibe,
        color_strategy: styleInfo.colorStrategy,
        color_palette: colorPalette,
        style_tags: styleInfo.tags,
        formality_score: styleInfo.formality,
        boldness_score: styleInfo.boldness,
        layering_level: styleInfo.layering,
      });
    };
    img.onerror = () => resolve(fallbackAnalysis());
    img.src = imageSrc;
  });
}

function fallbackAnalysis(): StructuredAnalysis {
  return {
    skin_tone: { category: "Medium", hex: "#C68642" },
    body_type: "Unknown",
    outfit: [{ type: "Outfit", dominant_color: "Unknown", hex: "#808080" }],
    accessories: [],
    outfit_type: "Unknown",
    style_tags: [],
  };
}

// ─── Build Structured Analysis (backward compat) ─────────────────────

export function buildStructuredAnalysis(
  rawAnalysis: RawAnalysis,
  skinTone: SkinTone,
  outfitColors: { color: string; hex: string }[]
): StructuredAnalysis {
  const rawOutfit = rawAnalysis?.outfit || [];
  const outfit: OutfitItem[] = rawOutfit
    .filter((o) => o && o.type !== "Unknown")
    .map((o, i) => ({
      type: o.type || "Unknown",
      dominant_color: outfitColors[i]?.color || o.dominant_color || "Unknown",
      hex: outfitColors[i]?.hex || o.hex || "#808080",
      confidence: o.confidence,
    }));
  if (outfit.length === 0 && outfitColors.length > 0) {
    outfit.push({ type: "Outfit", dominant_color: outfitColors[0].color, hex: outfitColors[0].hex });
  }
  return {
    skin_tone: skinTone,
    body_type: rawAnalysis?.body_type || "Unknown",
    outfit,
    accessories: rawAnalysis?.accessories || [],
  };
}

// ─── Occasion Options ────────────────────────────────────────────────

export const OCCASION_OPTIONS = [
  { label: "🏋️ Gym", value: "Gym" },
  { label: "💼 Office", value: "Office" },
  { label: "☕ Casual Outing", value: "Casual outing" },
  { label: "🎉 Party", value: "Party" },
  { label: "❤️ Date", value: "Date" },
  { label: "🎓 College", value: "College" },
  { label: "💒 Wedding", value: "Wedding" },
  { label: "✈️ Travel", value: "Travel" },
  { label: "🏖️ Beach", value: "Beach" },
  { label: "🍽️ Dinner", value: "Dinner" },
  { label: "🎭 Formal Event", value: "Formal Event" },
  { label: "🎤 Interview", value: "Interview" },
];
