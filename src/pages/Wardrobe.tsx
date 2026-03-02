import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Search, Heart, Trash2, Shirt, Filter, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

const CATEGORIES = ["Tops", "Bottoms", "Dresses", "Outerwear", "Shoes", "Accessories", "Bags", "Activewear"];
const SEASONS = ["Spring", "Summer", "Fall", "Winter", "All Season"];

type WardrobeItem = {
  id: string;
  name: string;
  category: string;
  color: string | null;
  brand: string | null;
  season: string | null;
  image_url: string | null;
  tags: string[];
  favorite: boolean;
  notes: string | null;
};

const Wardrobe = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<WardrobeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Form state
  const [form, setForm] = useState({
    name: "", category: "Tops", color: "", brand: "", season: "All Season", notes: "",
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) fetchItems();
  }, [user]);

  const fetchItems = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("wardrobe_items")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to load wardrobe");
    } else {
      setItems((data as WardrobeItem[]) || []);
    }
    setLoading(false);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const addItem = async () => {
    if (!form.name.trim() || !user) return;
    setUploading(true);

    let imageUrl: string | null = null;
    if (imageFile) {
      const ext = imageFile.name.split(".").pop();
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("wardrobe").upload(path, imageFile);
      if (!error) {
        const { data: urlData } = supabase.storage.from("wardrobe").getPublicUrl(path);
        imageUrl = urlData.publicUrl;
      }
    }

    const { error } = await supabase.from("wardrobe_items").insert({
      user_id: user.id,
      name: form.name,
      category: form.category,
      color: form.color || null,
      brand: form.brand || null,
      season: form.season,
      image_url: imageUrl,
      notes: form.notes || null,
    });

    if (error) {
      toast.error("Failed to add item");
    } else {
      toast.success("Item added!");
      setDialogOpen(false);
      setForm({ name: "", category: "Tops", color: "", brand: "", season: "All Season", notes: "" });
      setImageFile(null);
      setImagePreview(null);
      fetchItems();
    }
    setUploading(false);
  };

  const toggleFavorite = async (item: WardrobeItem) => {
    await supabase.from("wardrobe_items").update({ favorite: !item.favorite }).eq("id", item.id);
    setItems(items.map(i => i.id === item.id ? { ...i, favorite: !i.favorite } : i));
  };

  const deleteItem = async (id: string) => {
    await supabase.from("wardrobe_items").delete().eq("id", id);
    setItems(items.filter(i => i.id !== id));
    toast.success("Item removed");
  };

  const filtered = items.filter(i => {
    const matchSearch = i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.brand?.toLowerCase().includes(search.toLowerCase()) || false;
    const matchCategory = filterCategory === "all" || i.category === filterCategory;
    return matchSearch && matchCategory;
  });

  if (authLoading) return <div className="min-h-screen pt-20 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-accent" /></div>;

  return (
    <div className="min-h-screen pt-20 pb-12">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="font-display text-3xl font-bold">My Wardrobe</h1>
            <p className="text-muted-foreground text-sm mt-1">{items.length} items in your collection</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-full">
                <Plus className="h-4 w-4 mr-2" /> Add Item
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="font-display">Add to Wardrobe</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                {/* Image upload */}
                <div>
                  <Label>Photo</Label>
                  {imagePreview ? (
                    <div className="relative mt-2">
                      <img src={imagePreview} alt="Preview" className="w-full h-48 object-cover rounded-xl" />
                      <button onClick={() => { setImageFile(null); setImagePreview(null); }} className="absolute top-2 right-2 bg-background/80 rounded-full p-1">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <label className="mt-2 flex flex-col items-center justify-center h-32 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-accent/50 transition-colors">
                      <Upload className="h-6 w-6 text-muted-foreground mb-2" />
                      <span className="text-sm text-muted-foreground">Upload photo</span>
                      <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                    </label>
                  )}
                </div>

                <div>
                  <Label>Name *</Label>
                  <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Black leather jacket" className="mt-1" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Category</Label>
                    <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Season</Label>
                    <Select value={form.season} onValueChange={v => setForm({ ...form, season: v })}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SEASONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Color</Label>
                    <Input value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} placeholder="e.g. Black" className="mt-1" />
                  </div>
                  <div>
                    <Label>Brand</Label>
                    <Input value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })} placeholder="e.g. Zara" className="mt-1" />
                  </div>
                </div>

                <div>
                  <Label>Notes</Label>
                  <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Any notes..." className="mt-1" />
                </div>

                <Button onClick={addItem} disabled={uploading || !form.name.trim()} className="w-full bg-accent text-accent-foreground hover:bg-accent/90 rounded-full">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add to Wardrobe"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search items..." className="pl-10" />
          </div>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-full sm:w-48">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-accent" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <Shirt className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
            <h2 className="font-display text-2xl font-semibold mb-2">
              {items.length === 0 ? "Your wardrobe is empty" : "No items match your search"}
            </h2>
            <p className="text-muted-foreground text-sm">
              {items.length === 0 ? "Start by adding your favorite clothing items!" : "Try adjusting your filters."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <AnimatePresence>
              {filtered.map((item) => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="bg-card rounded-2xl border border-border/50 overflow-hidden group"
                >
                  <div className="aspect-square relative bg-secondary">
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Shirt className="h-12 w-12 text-muted-foreground/30" />
                      </div>
                    )}
                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => toggleFavorite(item)} className="p-2 rounded-full bg-background/80 backdrop-blur-sm">
                        <Heart className={`h-4 w-4 ${item.favorite ? "fill-accent text-accent" : "text-foreground"}`} />
                      </button>
                      <button onClick={() => deleteItem(item.id)} className="p-2 rounded-full bg-background/80 backdrop-blur-sm">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </button>
                    </div>
                  </div>
                  <div className="p-3">
                    <h3 className="font-medium text-sm truncate">{item.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-xs">{item.category}</Badge>
                      {item.color && <span className="text-xs text-muted-foreground">{item.color}</span>}
                    </div>
                    {item.brand && <p className="text-xs text-muted-foreground mt-1">{item.brand}</p>}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
};

export default Wardrobe;
