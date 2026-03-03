import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, RefreshCw, Heart, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";

const occasions = ["Work", "Date Night", "Casual Weekend", "Party", "Travel", "Wedding"];
const seasons = ["Spring", "Summer", "Autumn", "Winter"];
const palettes = ["Neutrals", "Pastels", "Bold & Bright", "Earth Tones", "Monochrome", "Jewel Tones"];
const vibes = ["Minimalist", "Streetwear", "Bohemian", "Classic", "Edgy", "Romantic"];

interface Outfit {
  text: string;
  imageUrl?: string;
}

const OutfitGenerator = () => {
  const [gender, setGender] = useState("");
  const [occasion, setOccasion] = useState("");
  const [season, setSeason] = useState("");
  const [palette, setPalette] = useState("");
  const [vibe, setVibe] = useState("");
  const [loading, setLoading] = useState(false);
  const [outfit, setOutfit] = useState<Outfit | null>(null);

  const generate = async () => {
    if (!gender || !occasion || !season) return;
    setLoading(true);
    setOutfit(null);

    try {
      const { data, error } = await supabase.functions.invoke("generate-outfit", {
        body: { occasion, season, palette, vibe, gender },
      });

      if (error) {
        // Check for rate limit or payment errors from the response
        const errorBody = data || {};
        if (errorBody.error === "Payment required") {
          setOutfit({ text: "⚠️ **AI credits exhausted.** Your Lovable AI usage limit has been reached. Please add more credits in your workspace settings (Settings → Workspace → Usage) to continue generating outfits." });
        } else if (errorBody.error === "Rate limit exceeded") {
          setOutfit({ text: "⚠️ **Too many requests.** Please wait a moment and try again." });
        } else {
          throw error;
        }
        return;
      }
      setOutfit({ text: data.text, imageUrl: data.imageUrl });
    } catch (e) {
      console.error(e);
      setOutfit({ text: "Something went wrong. Please try again!" });
    }
    setLoading(false);
  };

  const saveOutfit = () => {
    if (!outfit) return;
    const saved = JSON.parse(localStorage.getItem("stylesense-lookbook") || "[]");
    saved.unshift({
      ...outfit,
      occasion,
      season,
      palette,
      vibe,
      savedAt: new Date().toISOString(),
    });
    localStorage.setItem("stylesense-lookbook", JSON.stringify(saved));
  };

  return (
    <div className="min-h-screen pt-24 pb-12">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="text-center mb-10">
          <h1 className="font-display text-3xl md:text-4xl font-bold mb-3">Outfit Generator</h1>
          <p className="text-muted-foreground">Select your parameters and let AI create a complete look for you.</p>
        </div>

        {/* Selectors */}
        {/* Gender Toggle */}
        <div className="flex justify-center gap-3 mb-6">
          <Button
            variant={gender === "female" ? "default" : "outline"}
            onClick={() => setGender("female")}
            className="rounded-full px-6"
          >
            👩 Female
          </Button>
          <Button
            variant={gender === "male" ? "default" : "outline"}
            onClick={() => setGender("male")}
            className="rounded-full px-6"
          >
            👨 Male
          </Button>
        </div>

        {/* Selectors */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">Occasion</label>
            <Select value={occasion} onValueChange={setOccasion}>
              <SelectTrigger><SelectValue placeholder="Pick one" /></SelectTrigger>
              <SelectContent>{occasions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">Season</label>
            <Select value={season} onValueChange={setSeason}>
              <SelectTrigger><SelectValue placeholder="Pick one" /></SelectTrigger>
              <SelectContent>{seasons.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">Color Palette</label>
            <Select value={palette} onValueChange={setPalette}>
              <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
              <SelectContent>{palettes.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">Style Vibe</label>
            <Select value={vibe} onValueChange={setVibe}>
              <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
              <SelectContent>{vibes.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-center gap-3 mb-10">
          <Button
            onClick={generate}
            disabled={!gender || !occasion || !season || loading}
            className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-full px-8"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
            Generate Outfit
          </Button>
          {outfit && (
            <Button variant="outline" onClick={generate} className="rounded-full" disabled={loading}>
              <RefreshCw className="h-4 w-4 mr-2" /> Regenerate
            </Button>
          )}
        </div>

        {/* Result */}
        {outfit && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="overflow-hidden border-accent/10">
              {outfit.imageUrl && (
                <div className="aspect-video bg-secondary">
                  <img src={outfit.imageUrl} alt="AI generated outfit" className="w-full h-full object-cover" />
                </div>
              )}
              <CardContent className="p-6">
                <div className="prose prose-sm max-w-none dark:prose-invert mb-4">
                  <ReactMarkdown>{outfit.text}</ReactMarkdown>
                </div>
                <Button onClick={saveOutfit} variant="outline" className="rounded-full">
                  <Heart className="h-4 w-4 mr-2" /> Save to Lookbook
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default OutfitGenerator;
