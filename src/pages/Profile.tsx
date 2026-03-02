import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { User, Save, Loader2, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

const Profile = () => {
  const { user, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isPremium, setIsPremium] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) loadProfile();
  }, [user]);

  const loadProfile = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", user!.id)
      .single();

    if (data) {
      setDisplayName(data.display_name || "");
      setBio(data.bio || "");
      setIsPremium(data.is_premium || false);
    }
    setLoading(false);
  };

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: displayName, bio })
      .eq("user_id", user.id);

    if (error) toast.error("Failed to save");
    else toast.success("Profile updated!");
    setSaving(false);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  if (authLoading || loading) return <div className="min-h-screen pt-20 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-accent" /></div>;

  return (
    <div className="min-h-screen pt-20 pb-12">
      <div className="container mx-auto px-4 max-w-lg">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="text-center mb-8">
            <div className="w-20 h-20 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4">
              <User className="h-10 w-10 text-accent" />
            </div>
            <h1 className="font-display text-3xl font-bold">Your Profile</h1>
            <p className="text-sm text-muted-foreground mt-1">{user?.email}</p>
            {isPremium && (
              <div className="inline-flex items-center gap-1 mt-2 px-3 py-1 rounded-full bg-accent/10 text-accent text-xs font-medium">
                <Crown className="h-3 w-3" /> Premium Member
              </div>
            )}
          </div>

          <div className="bg-card border border-border rounded-2xl p-8 space-y-5">
            <div>
              <Label>Display Name</Label>
              <Input value={displayName} onChange={e => setDisplayName(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Bio</Label>
              <Input value={bio} onChange={e => setBio(e.target.value)} placeholder="Tell us about your style..." className="mt-1" />
            </div>

            <Button onClick={saveProfile} disabled={saving} className="w-full bg-accent text-accent-foreground hover:bg-accent/90 rounded-full">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-2" /> Save Profile</>}
            </Button>
          </div>

          <div className="mt-6 text-center">
            <button onClick={handleSignOut} className="text-sm text-muted-foreground hover:text-destructive transition-colors">
              Sign Out
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Profile;
