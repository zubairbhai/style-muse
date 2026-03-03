import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { Upload, X, Loader2, Camera, Sparkles, ScanSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";
import { useToast } from "@/hooks/use-toast";
import ClothingDetectionResults from "@/components/ClothingDetectionResults";
import ImageWithBoundingBoxes from "@/components/ImageWithBoundingBoxes";
import { extractDominantColors } from "@/lib/colorExtraction";

const occasions = ["Work / Office", "Date Night", "Casual Day Out", "Party / Club", "Wedding / Formal", "Travel", "Gym / Activewear", "Interview"];
const seasons = ["Spring", "Summer", "Autumn", "Winter"];
const contexts = ["Rate my outfit", "Suggest best combinations", "What should I pair this with?", "Is this appropriate for the occasion?"];

const OutfitAnalyzer = () => {
  const [images, setImages] = useState<{ file: File; preview: string }[]>([]);
  const [occasion, setOccasion] = useState("");
  const [season, setSeason] = useState("");
  const [context, setContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [detectLoading, setDetectLoading] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [detectionResult, setDetectionResult] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("detect");
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const newImages = Array.from(files)
      .filter((f) => f.type.startsWith("image/"))
      .slice(0, 5 - images.length)
      .map((file) => ({ file, preview: URL.createObjectURL(file) }));

    if (newImages.length === 0) {
      toast({ title: "Please upload image files only", variant: "destructive" });
      return;
    }
    setImages((prev) => [...prev, ...newImages].slice(0, 5));
    setDetectionResult(null);
    setAnalysis(null);
  };

  const removeImage = (index: number) => {
    setImages((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
    setDetectionResult(null);
  };

  const detectClothing = async () => {
    if (images.length === 0) return;
    setDetectLoading(true);
    setDetectionResult(null);

    try {
      // Upload first image to storage for the edge function
      const img = images[0];
      const ext = img.file.name.split(".").pop() || "jpg";
      const path = `detect-${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("outfit-uploads")
        .upload(path, img.file, { contentType: img.file.type });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("outfit-uploads").getPublicUrl(path);
      const imageUrl = urlData.publicUrl;

      // Run HF detection and client-side color extraction in parallel
      const [detectionResponse, colors] = await Promise.all([
        supabase.functions.invoke("analyze-clothing", {
          body: { imageUrl },
        }),
        extractDominantColors(img.preview),
      ]);

      if (detectionResponse.error) throw detectionResponse.error;

      const result = {
        ...detectionResponse.data,
        dominant_colors: colors,
      };

      setDetectionResult(result);
      toast({ title: "Detection complete!", description: `Found ${result.clothing_items?.length || 0} clothing items.` });
    } catch (e: any) {
      console.error(e);
      toast({ title: "Detection failed", description: e.message || "Please try again.", variant: "destructive" });
    }
    setDetectLoading(false);
  };

  const analyzeStyle = async () => {
    if (images.length === 0) return;
    setLoading(true);
    setAnalysis(null);

    try {
      const imageUrls: string[] = [];
      for (const img of images) {
        const ext = img.file.name.split(".").pop() || "jpg";
        const path = `${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("outfit-uploads")
          .upload(path, img.file, { contentType: img.file.type });

        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from("outfit-uploads").getPublicUrl(path);
        imageUrls.push(urlData.publicUrl);
      }

      const { data, error } = await supabase.functions.invoke("analyze-outfit", {
        body: { imageUrls, occasion, season, context },
      });

      if (error) throw error;
      setAnalysis(data.analysis);
    } catch (e: any) {
      console.error(e);
      toast({ title: "Analysis failed", description: e.message || "Please try again.", variant: "destructive" });
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen pt-24 pb-12">
      <div className="container mx-auto px-4 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/10 text-accent text-sm font-medium mb-4">
            <Camera className="h-4 w-4" />
            AI Outfit Analyzer
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-bold mb-3">
            Get Expert Styling Feedback
          </h1>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Upload photos of your outfit — detect clothing items with open-source AI, extract colors, or get full styling advice.
          </p>
        </div>

        {/* Upload Area */}
        <div
          className="border-2 border-dashed border-border rounded-2xl p-8 text-center mb-6 hover:border-accent/40 transition-colors cursor-pointer"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleFiles(e.dataTransfer.files); }}
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium mb-1">Drag & drop or click to upload</p>
          <p className="text-xs text-muted-foreground">Up to 5 images • JPG, PNG, WEBP</p>
        </div>

        {/* Image Previews */}
        {images.length > 0 && (
          <div className="flex flex-wrap gap-3 mb-6">
            {images.map((img, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="relative w-24 h-24 rounded-xl overflow-hidden border border-border group"
              >
                <img src={img.preview} alt={`Outfit ${i + 1}`} className="w-full h-full object-cover" />
                <button
                  onClick={(e) => { e.stopPropagation(); removeImage(i); }}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-3 w-3" />
                </button>
              </motion.div>
            ))}
          </div>
        )}

        {/* Tabs: Detect vs Analyze */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-8">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="detect" className="flex items-center gap-2">
              <ScanSearch className="h-4 w-4" />
              Detect Items (Free)
            </TabsTrigger>
            <TabsTrigger value="analyze" className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Full Analysis
            </TabsTrigger>
          </TabsList>

          <TabsContent value="detect" className="space-y-6 mt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-4">
                Uses Hugging Face open-source models to detect clothing items, classify styles, and extract colors — no paid AI credits.
              </p>
              <Button
                onClick={detectClothing}
                disabled={images.length === 0 || detectLoading}
                className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-full px-8"
              >
                {detectLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ScanSearch className="h-4 w-4 mr-2" />}
                {detectLoading ? "Detecting clothing..." : "Detect Clothing Items"}
              </Button>
            </div>

            {detectionResult && (
              <div className="space-y-6">
                {/* Image with bounding boxes */}
                {images.length > 0 && detectionResult.object_detections?.length > 0 && (
                  <ImageWithBoundingBoxes
                    imageSrc={images[0].preview}
                    detections={detectionResult.object_detections}
                  />
                )}

                <ClothingDetectionResults result={detectionResult} />
              </div>
            )}
          </TabsContent>

          <TabsContent value="analyze" className="space-y-6 mt-6">
            {/* Options */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">Occasion</label>
                <Select value={occasion} onValueChange={setOccasion}>
                  <SelectTrigger><SelectValue placeholder="What's the occasion?" /></SelectTrigger>
                  <SelectContent>{occasions.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">Season</label>
                <Select value={season} onValueChange={setSeason}>
                  <SelectTrigger><SelectValue placeholder="What season?" /></SelectTrigger>
                  <SelectContent>{seasons.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">What do you want?</label>
                <Select value={context} onValueChange={setContext}>
                  <SelectTrigger><SelectValue placeholder="Pick feedback type" /></SelectTrigger>
                  <SelectContent>{contexts.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-center">
              <Button
                onClick={analyzeStyle}
                disabled={images.length === 0 || loading}
                className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-full px-8"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                {loading ? "Analyzing your look..." : "Analyze My Outfit"}
              </Button>
            </div>

            {analysis && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                <Card className="border-accent/10">
                  <CardContent className="p-6 md:p-8">
                    <div className="prose prose-sm max-w-none dark:prose-invert">
                      <ReactMarkdown>{analysis}</ReactMarkdown>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default OutfitAnalyzer;
