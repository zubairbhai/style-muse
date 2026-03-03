/**
 * Rule-based outfit recommendation engine — 100% free, no API calls.
 * Uses color theory, style rules, and detected clothing data.
 */

interface DetectedItem {
  category: string;
  confidence: number;
  dominant_colors?: { color: string; hex: string; percentage: number }[];
}

interface AnalysisData {
  clothing_items: DetectedItem[];
  style_classifications?: { label: string; confidence: number }[];
  body_attributes?: { person_detected: boolean };
  raw_segmentation_labels?: string[];
}

interface Recommendation {
  title: string;
  items: string[];
  reasoning: string;
  colorScheme: string;
}

// Color harmony rules
const COMPLEMENTARY: Record<string, string[]> = {
  red: ["green", "teal", "dark green"],
  blue: ["orange", "brown", "cream"],
  green: ["red", "burgundy", "magenta"],
  yellow: ["purple", "indigo", "navy"],
  purple: ["yellow", "cream", "lime"],
  orange: ["blue", "navy", "teal"],
  navy: ["cream", "white", "orange"],
  black: ["white", "red", "cream", "any color"],
  white: ["navy", "black", "burgundy", "any color"],
  brown: ["cream", "blue", "teal"],
  burgundy: ["cream", "navy", "white"],
  teal: ["cream", "brown", "red"],
  pink: ["navy", "dark green", "black"],
};

const NEUTRAL_COLORS = ["black", "white", "dark gray", "light gray", "cream", "navy", "brown"];

// Style-based recommendations
const STYLE_OUTFITS: Record<string, Recommendation[]> = {
  casual: [
    { title: "Relaxed Weekend", items: ["Fitted t-shirt", "Slim jeans", "Clean sneakers", "Minimal watch"], reasoning: "Effortless and comfortable", colorScheme: "Earth tones" },
    { title: "Smart Casual", items: ["Oxford shirt (rolled sleeves)", "Chinos", "Loafers", "Leather belt"], reasoning: "Polished without trying too hard", colorScheme: "Navy + Khaki" },
  ],
  formal: [
    { title: "Business Sharp", items: ["Tailored blazer", "Dress shirt", "Slim trousers", "Oxford shoes"], reasoning: "Professional and commanding", colorScheme: "Charcoal + White" },
    { title: "Evening Elegance", items: ["Dark suit", "Silk tie", "Pocket square", "Dress watch"], reasoning: "Classic sophistication", colorScheme: "Navy + Burgundy" },
  ],
  streetwear: [
    { title: "Urban Edge", items: ["Oversized hoodie", "Cargo pants", "Chunky sneakers", "Crossbody bag"], reasoning: "Bold street style", colorScheme: "Black + Pops of color" },
    { title: "Retro Street", items: ["Vintage graphic tee", "Wide-leg jeans", "Retro runners", "Bucket hat"], reasoning: "90s-inspired cool", colorScheme: "Washed tones" },
  ],
  minimalist: [
    { title: "Clean Lines", items: ["Structured tee", "Tailored trousers", "Minimal leather shoes", "Simple bracelet"], reasoning: "Less is more", colorScheme: "Monochrome" },
  ],
};

function detectStyle(analysis: AnalysisData): string {
  const labels = analysis.raw_segmentation_labels || [];
  const styleLabels = analysis.style_classifications?.map(s => s.label.toLowerCase()) || [];
  
  if (labels.some(l => l.includes("suit") || l.includes("dress"))) return "formal";
  if (styleLabels.some(l => l.includes("military") || l.includes("jersey"))) return "streetwear";
  if (labels.length <= 2) return "minimalist";
  return "casual";
}

function getColorRecommendations(detectedColors: string[]): string[] {
  const suggestions = new Set<string>();
  for (const color of detectedColors) {
    const complements = COMPLEMENTARY[color.toLowerCase()];
    if (complements) complements.forEach(c => suggestions.add(c));
  }
  if (suggestions.size === 0) {
    NEUTRAL_COLORS.forEach(c => suggestions.add(c));
  }
  return Array.from(suggestions).slice(0, 5);
}

function getCategoryGaps(detected: string[]): string[] {
  const essential = ["upper_body", "lower_body", "shoes", "hat", "bag", "scarf"];
  const normalized = detected.map(d => d.toLowerCase().replace(/[-\s]/g, "_"));
  
  const missing: string[] = [];
  const hasTop = normalized.some(d => ["upper_body", "shirt", "top", "t_shirt", "jacket", "coat", "blazer", "sweater", "hoodie"].includes(d));
  const hasBottom = normalized.some(d => ["lower_body", "pants", "trousers", "skirt", "jeans", "shorts"].includes(d));
  const hasShoes = normalized.some(d => ["shoes", "boots", "sneakers", "sandals"].includes(d));
  
  if (!hasTop) missing.push("a complementary top");
  if (!hasBottom) missing.push("matching bottoms");
  if (!hasShoes) missing.push("appropriate footwear");
  if (!normalized.some(d => ["bag", "handbag", "backpack"].includes(d))) missing.push("a stylish bag");
  if (!normalized.some(d => ["hat", "cap", "sunglasses", "scarf", "belt"].includes(d))) missing.push("an accessory (hat, scarf, or belt)");
  
  return missing;
}

export function generateRecommendations(analysis: AnalysisData): string {
  const style = detectStyle(analysis);
  const items = analysis.clothing_items || [];
  const categories = items.map(i => i.category);
  const allColors = items.flatMap(i => (i.dominant_colors || []).map(c => c.color));
  const uniqueColors = [...new Set(allColors)];
  
  const colorRecs = getColorRecommendations(uniqueColors);
  const gaps = getCategoryGaps(categories);
  const outfits = STYLE_OUTFITS[style] || STYLE_OUTFITS.casual;

  let md = `## 👗 Style Analysis\n\n`;
  
  // What was detected
  md += `**Detected Style:** ${style.charAt(0).toUpperCase() + style.slice(1)}\n\n`;
  
  if (items.length > 0) {
    md += `**Items Found:**\n`;
    for (const item of items) {
      const colors = (item.dominant_colors || []).slice(0, 2).map(c => c.color).join(", ");
      md += `- ${item.category.replace(/_/g, " ")} (${Math.round(item.confidence * 100)}% confidence)${colors ? ` — ${colors}` : ""}\n`;
    }
    md += "\n";
  }

  // Color palette
  if (uniqueColors.length > 0) {
    md += `**Your Color Palette:** ${uniqueColors.slice(0, 4).join(", ")}\n`;
    md += `**Suggested Complementary Colors:** ${colorRecs.join(", ")}\n\n`;
  }

  // Missing pieces
  if (gaps.length > 0) {
    md += `### 🧩 Complete Your Look\nConsider adding: ${gaps.join(", ")}.\n\n`;
  }

  // Outfit recommendations
  md += `### ✨ Outfit Ideas for You\n\n`;
  for (const outfit of outfits) {
    md += `**${outfit.title}** — *${outfit.reasoning}*\n`;
    outfit.items.forEach(item => { md += `- ${item}\n`; });
    md += `- Color scheme: ${outfit.colorScheme}\n\n`;
  }

  // Tips
  md += `### 💡 Pro Tips\n`;
  if (uniqueColors.length > 3) {
    md += `- You have many colors — try limiting your palette to 3 main colors for a cohesive look.\n`;
  }
  if (style === "casual") {
    md += `- Layer with a structured jacket to instantly elevate a casual outfit.\n`;
  }
  md += `- The rule of thirds works in fashion too — break your outfit into visual thirds for balance.\n`;
  md += `- When in doubt, one statement piece + neutrals = effortless style.\n`;

  return md;
}
