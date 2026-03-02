import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, TrendingUp, ExternalLink, Newspaper } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";

const categories = ["Seasonal", "Street Style", "Workwear", "Evening"];

interface TrendItem {
  title: string;
  description: string;
  imageUrl?: string;
}

interface ArticleItem {
  title: string;
  description: string;
  url: string;
  source: string;
}

const TrendExplorer = () => {
  const [selectedCategory, setSelectedCategory] = useState("Seasonal");
  const [trends, setTrends] = useState<TrendItem[]>([]);
  const [articles, setArticles] = useState<ArticleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"ai" | "articles">("articles");

  const fetchArticles = async (category: string) => {
    setSelectedCategory(category);
    setLoading(true);
    setArticles([]);

    try {
      const { data, error } = await supabase.functions.invoke("fetch-fashion-articles", {
        body: { category },
      });

      if (error) throw error;
      if (data?.articles) setArticles(data.articles);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const fetchTrends = async (category: string) => {
    setSelectedCategory(category);
    setLoading(true);
    setTrends([]);

    try {
      const { data, error } = await supabase.functions.invoke("generate-trends", {
        body: { category },
      });

      if (error) throw error;
      setTrends(data.trends || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleCategoryClick = (cat: string) => {
    if (activeTab === "articles") {
      fetchArticles(cat);
    } else {
      fetchTrends(cat);
    }
  };

  const handleTabSwitch = (tab: "ai" | "articles") => {
    setActiveTab(tab);
    setTrends([]);
    setArticles([]);
  };

  return (
    <div className="min-h-screen pt-24 pb-12">
      <div className="container mx-auto px-4 max-w-5xl">
        <div className="text-center mb-10">
          <h1 className="font-display text-3xl md:text-4xl font-bold mb-3">Trend Explorer</h1>
          <p className="text-muted-foreground">Discover what's hot in fashion right now.</p>
        </div>

        {/* Tab toggle */}
        <div className="flex justify-center gap-2 mb-6">
          <Button
            variant={activeTab === "articles" ? "default" : "outline"}
            onClick={() => handleTabSwitch("articles")}
            className={`rounded-full gap-2 ${activeTab === "articles" ? "bg-primary text-primary-foreground" : ""}`}
          >
            <Newspaper className="h-4 w-4" />
            Trending Articles
          </Button>
          <Button
            variant={activeTab === "ai" ? "default" : "outline"}
            onClick={() => handleTabSwitch("ai")}
            className={`rounded-full gap-2 ${activeTab === "ai" ? "bg-primary text-primary-foreground" : ""}`}
          >
            <TrendingUp className="h-4 w-4" />
            AI Trends
          </Button>
        </div>

        {/* Category tabs */}
        <div className="flex flex-wrap justify-center gap-2 mb-10">
          {categories.map((cat) => (
            <Button
              key={cat}
              variant={selectedCategory === cat ? "default" : "outline"}
              onClick={() => handleCategoryClick(cat)}
              className={`rounded-full ${selectedCategory === cat ? "bg-accent text-accent-foreground hover:bg-accent/90" : ""}`}
              disabled={loading}
            >
              {cat}
            </Button>
          ))}
        </div>

        {loading && (
          <div className="text-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-accent mx-auto mb-4" />
            <p className="text-muted-foreground text-sm">
              {activeTab === "articles" ? "Fetching trending articles..." : "Discovering trends..."}
            </p>
          </div>
        )}

        {!loading && articles.length === 0 && trends.length === 0 && (
          <div className="text-center py-20">
            <TrendingUp className="h-16 w-16 text-muted-foreground/20 mx-auto mb-4" />
            <h2 className="font-display text-xl font-semibold mb-2">Explore Trends</h2>
            <p className="text-muted-foreground text-sm">Pick a category above to discover fashion trends.</p>
          </div>
        )}

        {/* Articles view */}
        {activeTab === "articles" && articles.length > 0 && (
          <div className="grid md:grid-cols-2 gap-5">
            {articles.map((article, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07 }}
              >
                <a href={article.url} target="_blank" rel="noopener noreferrer" className="block h-full">
                  <Card className="overflow-hidden h-full hover:border-primary/40 transition-colors group cursor-pointer">
                    <CardContent className="p-6 flex flex-col h-full">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <h3 className="font-display text-lg font-semibold leading-tight group-hover:text-primary transition-colors line-clamp-2">
                          {article.title}
                        </h3>
                        <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors mt-1" />
                      </div>
                      <p className="text-muted-foreground text-sm leading-relaxed flex-1 line-clamp-4">
                        {article.description}
                      </p>
                      <div className="mt-4 pt-3 border-t border-border">
                        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                          {article.source}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </a>
              </motion.div>
            ))}
          </div>
        )}

        {/* AI Trends view */}
        {activeTab === "ai" && trends.length > 0 && (
          <div className="grid md:grid-cols-2 gap-6">
            {trends.map((trend, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
              >
                <Card className="overflow-hidden h-full">
                  {trend.imageUrl && (
                    <div className="aspect-video bg-secondary">
                      <img src={trend.imageUrl} alt={trend.title} className="w-full h-full object-cover" />
                    </div>
                  )}
                  <CardContent className="p-6">
                    <h3 className="font-display text-lg font-semibold mb-2">{trend.title}</h3>
                    <div className="prose prose-sm max-w-none dark:prose-invert text-muted-foreground">
                      <ReactMarkdown>{trend.description}</ReactMarkdown>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TrendExplorer;
