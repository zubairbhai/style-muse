
-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  style_preferences JSONB DEFAULT '{}',
  is_premium BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Public profiles are viewable" ON public.profiles FOR SELECT USING (true);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Wardrobe items
CREATE TABLE public.wardrobe_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  color TEXT,
  brand TEXT,
  season TEXT,
  image_url TEXT,
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  favorite BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.wardrobe_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own wardrobe" ON public.wardrobe_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert wardrobe items" ON public.wardrobe_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their wardrobe items" ON public.wardrobe_items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their wardrobe items" ON public.wardrobe_items FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_wardrobe_items_updated_at
  BEFORE UPDATE ON public.wardrobe_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Saved outfits
CREATE TABLE public.saved_outfits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  occasion TEXT,
  season TEXT,
  items UUID[] DEFAULT '{}',
  ai_generated_text TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.saved_outfits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own outfits" ON public.saved_outfits FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert outfits" ON public.saved_outfits FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their outfits" ON public.saved_outfits FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their outfits" ON public.saved_outfits FOR DELETE USING (auth.uid() = user_id);

-- Storage bucket for wardrobe images
INSERT INTO storage.buckets (id, name, public) VALUES ('wardrobe', 'wardrobe', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can upload wardrobe images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'wardrobe' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can view their wardrobe images" ON storage.objects FOR SELECT USING (bucket_id = 'wardrobe');
CREATE POLICY "Users can delete their wardrobe images" ON storage.objects FOR DELETE USING (bucket_id = 'wardrobe' AND auth.uid()::text = (storage.foldername(name))[1]);
