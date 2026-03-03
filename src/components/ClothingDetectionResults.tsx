import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shirt, Eye, Palette, User } from "lucide-react";

interface ClothingItem {
  category: string;
  confidence: number;
  bounding_box?: number[] | null;
  source?: string;
}

interface StyleLabel {
  label: string;
  confidence: number;
}

interface AnalysisResult {
  clothing_items: ClothingItem[];
  object_detections: ClothingItem[];
  style_classifications: StyleLabel[];
  body_attributes: {
    person_detected: boolean;
    person_box: { xmin: number; ymin: number; xmax: number; ymax: number } | null;
  };
  raw_segmentation_labels: string[];
  dominant_colors?: { color: string; hex: string; percentage: number }[];
}

interface Props {
  result: AnalysisResult;
}

const categoryIcons: Record<string, string> = {
  upper_clothes: "👕",
  lower_clothes: "👖",
  dress: "👗",
  coat: "🧥",
  hat: "🎩",
  shoes: "👟",
  bag: "👜",
  scarf: "🧣",
  skirt: "👗",
  accessory: "💍",
  full_outfit: "🧍",
  glove: "🧤",
  socks: "🧦",
  left_shoe: "👞",
  right_shoe: "👞",
  face: "😊",
  hair: "💇",
  sunglasses: "🕶️",
  belt: "🪢",
};

function formatCategory(cat: string): string {
  return cat.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

const ClothingDetectionResults = ({ result }: Props) => {
  return (
    <div className="space-y-4">
      {/* Clothing Items */}
      {result.clothing_items.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Shirt className="h-4 w-4 text-accent" />
                Detected Clothing Items
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {result.clothing_items.map((item, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-2 rounded-lg bg-secondary/50"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">
                      {categoryIcons[item.category] || "👚"}
                    </span>
                    <span className="text-sm font-medium">
                      {formatCategory(item.category)}
                    </span>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {Math.round(item.confidence * 100)}%
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Style Classifications */}
      {result.style_classifications.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Eye className="h-4 w-4 text-accent" />
                Style Classification
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {result.style_classifications.map((cls, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {cls.label} ({Math.round(cls.confidence * 100)}%)
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Dominant Colors */}
      {result.dominant_colors && result.dominant_colors.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Palette className="h-4 w-4 text-accent" />
                Dominant Colors
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3">
                {result.dominant_colors.map((c, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <div
                      className="w-10 h-10 rounded-lg border border-border shadow-sm"
                      style={{ backgroundColor: c.hex }}
                    />
                    <span className="text-[10px] text-muted-foreground">
                      {c.color}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {Math.round(c.percentage)}%
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Body Detection */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <User className="h-4 w-4 text-accent" />
              Body Detection
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  result.body_attributes.person_detected
                    ? "bg-green-500"
                    : "bg-muted-foreground"
                }`}
              />
              <span className="text-sm text-muted-foreground">
                {result.body_attributes.person_detected
                  ? "Person detected in image"
                  : "No person detected"}
              </span>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Raw JSON */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">
              Structured JSON Output
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-secondary/50 p-3 rounded-lg overflow-x-auto max-h-64 overflow-y-auto">
              {JSON.stringify(result, null, 2)}
            </pre>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default ClothingDetectionResults;
