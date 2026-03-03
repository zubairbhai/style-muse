import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Send, Sparkles, Loader2, ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";
import { extractDominantColors } from "@/lib/colorExtraction";
import { generateRecommendations } from "@/lib/outfitRecommender";
import { supabase } from "@/integrations/supabase/client";

type Msg = { role: "user" | "assistant"; content: string; imageUrl?: string };

const ANALYZE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-clothing`;

const AIStylistChat = () => {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    const reader = new FileReader();
    reader.onload = () => setPendingImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  const uploadImage = async (file: File): Promise<string | null> => {
    const ext = file.name.split(".").pop() || "jpg";
    const path = `chat/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("outfit-uploads").upload(path, file);
    if (error) { console.error("Upload error:", error); return null; }
    const { data } = supabase.storage.from("outfit-uploads").getPublicUrl(path);
    return data.publicUrl;
  };

  const analyzeImage = async (imageUrl: string) => {
    // 1. Call free HF detection
    const resp = await fetch(ANALYZE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ imageUrl }),
    });
    if (!resp.ok) throw new Error("Analysis failed");
    const analysis = await resp.json();

    // 2. Client-side color extraction per item
    const colors = await extractDominantColors(imageUrl, 5);
    for (const item of analysis.clothing_items || []) {
      item.dominant_colors = colors.slice(0, 3);
    }

    return analysis;
  };

  const send = async () => {
    const hasText = input.trim().length > 0;
    const hasImage = !!pendingFile;
    if ((!hasText && !hasImage) || isLoading) return;

    setIsLoading(true);
    let imageUrl: string | undefined;

    // Upload image if present
    if (pendingFile) {
      const url = await uploadImage(pendingFile);
      if (url) imageUrl = url;
      setPendingImage(null);
      setPendingFile(null);
    }

    const userMsg: Msg = {
      role: "user",
      content: hasText ? input.trim() : "Analyze my outfit and recommend styles",
      imageUrl,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    if (imageUrl) {
      // Free image analysis path — no paid AI
      try {
        const addAssistant = (content: string) => {
          setMessages((prev) => [...prev, { role: "assistant", content }]);
        };
        addAssistant("🔍 Analyzing your outfit using free open-source models...");

        const analysis = await analyzeImage(imageUrl);
        const recommendations = generateRecommendations(analysis);

        setMessages((prev) => {
          const filtered = prev.filter((m, i) => !(i === prev.length - 1 && m.content.includes("Analyzing")));
          return [...filtered, { role: "assistant", content: recommendations }];
        });
      } catch (e) {
        console.error(e);
        setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, I couldn't analyze that image. Please try a clearer photo." }]);
      }
      setIsLoading(false);
      return;
    }

    // Text-only: use streaming stylist chat (existing)
    let assistantSoFar = "";
    const upsertAssistant = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
        }
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    try {
      const profile = localStorage.getItem("stylesense-profile");
      const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stylist-chat`;
      const allMessages = messages.concat(userMsg).map(({ role, content }) => ({ role, content }));

      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: allMessages, styleProfile: profile ? JSON.parse(profile) : null }),
      });

      if (!resp.ok || !resp.body) {
        if (resp.status === 429) {
          upsertAssistant("Too many requests right now. Please try again in a moment. 🙏");
          setIsLoading(false);
          return;
        }
        throw new Error("Stream failed");
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });
        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) upsertAssistant(content);
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }
    } catch (e) {
      console.error(e);
      upsertAssistant("Sorry, I encountered an error. Please try again!");
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen pt-16 flex flex-col">
      <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full">
        {/* Header */}
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-accent" />
            </div>
            <div>
              <h1 className="font-display text-xl font-semibold">AI Stylist</h1>
              <p className="text-xs text-muted-foreground">Upload a photo or ask for outfit advice — image analysis is free & unlimited</p>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.length === 0 && (
            <div className="text-center py-16">
              <Sparkles className="h-12 w-12 text-accent/30 mx-auto mb-4" />
              <h2 className="font-display text-2xl font-semibold mb-2">What's the occasion?</h2>
              <p className="text-muted-foreground text-sm max-w-sm mx-auto mb-6">
                Upload an outfit photo for free AI analysis, or ask for styling advice!
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {["Date night outfit ideas", "Work from home but make it chic", "Summer vacation wardrobe"].map((s) => (
                  <button
                    key={s}
                    onClick={() => setInput(s)}
                    className="px-4 py-2 rounded-full border border-border hover:border-accent/30 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                  msg.role === "user"
                    ? "bg-accent text-accent-foreground rounded-br-md"
                    : "bg-secondary text-secondary-foreground rounded-bl-md"
                }`}
              >
                {msg.imageUrl && (
                  <img src={msg.imageUrl} alt="Uploaded outfit" className="rounded-lg mb-2 max-h-64 object-cover w-full" />
                )}
                {msg.role === "assistant" ? (
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm">{msg.content}</p>
                )}
              </div>
            </motion.div>
          ))}

          {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
            <div className="flex justify-start">
              <div className="bg-secondary rounded-2xl rounded-bl-md px-4 py-3">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}
        </div>

        {/* Pending image preview */}
        {pendingImage && (
          <div className="px-4 pb-2">
            <div className="relative inline-block">
              <img src={pendingImage} alt="Preview" className="h-20 rounded-lg border border-border" />
              <button
                onClick={() => { setPendingImage(null); setPendingFile(null); }}
                className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}

        {/* Input */}
        <div className="border-t border-border p-4">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
          <form
            onSubmit={(e) => { e.preventDefault(); send(); }}
            className="flex gap-2 max-w-3xl mx-auto"
          >
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => fileRef.current?.click()}
              disabled={isLoading}
              className="rounded-full h-11 w-11 shrink-0"
            >
              <ImagePlus className="h-5 w-5" />
            </Button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask your AI stylist or upload a photo..."
              className="flex-1 bg-secondary/50 rounded-full px-5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 border border-border"
              disabled={isLoading}
            />
            <Button
              type="submit"
              size="icon"
              disabled={isLoading || (!input.trim() && !pendingFile)}
              className="rounded-full bg-accent text-accent-foreground hover:bg-accent/90 h-11 w-11"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AIStylistChat;
