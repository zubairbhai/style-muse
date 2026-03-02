import { Link, useLocation } from "react-router-dom";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, Sparkles, User, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

const navItems = [
  { label: "Home", path: "/" },
  { label: "Style Quiz", path: "/quiz" },
  { label: "AI Stylist", path: "/chat" },
  { label: "Generator", path: "/generator" },
  { label: "Analyzer", path: "/analyzer" },
  { label: "Wardrobe", path: "/wardrobe" },
  { label: "Lookbook", path: "/lookbook" },
  { label: "Trends", path: "/trends" },
];

const Navbar = () => {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { user } = useAuth();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border/50">
      <div className="container mx-auto flex items-center justify-between h-16 px-4">
        <Link to="/" className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-accent" />
          <span className="font-display text-xl font-semibold tracking-tight">StyleSense</span>
        </Link>

        {/* Desktop */}
        <div className="hidden md:flex items-center gap-1">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                location.pathname === item.path
                  ? "text-accent"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.label}
            </Link>
          ))}
          {user ? (
            <Link to="/profile" className="ml-2 p-2 rounded-full hover:bg-secondary transition-colors">
              <User className="h-5 w-5 text-accent" />
            </Link>
          ) : (
            <Button asChild size="sm" className="ml-2 bg-accent text-accent-foreground hover:bg-accent/90 rounded-full">
              <Link to="/auth"><LogIn className="h-4 w-4 mr-1" /> Sign In</Link>
            </Button>
          )}
        </div>

        {/* Mobile toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => setOpen(!open)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden border-b border-border bg-background"
          >
            <div className="flex flex-col p-4 gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setOpen(false)}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    location.pathname === item.path
                      ? "text-accent bg-accent/10"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
              {user ? (
                <Link to="/profile" onClick={() => setOpen(false)} className="px-3 py-2 rounded-md text-sm font-medium text-accent">
                  My Profile
                </Link>
              ) : (
                <Link to="/auth" onClick={() => setOpen(false)} className="px-3 py-2 rounded-md text-sm font-medium text-accent">
                  Sign In
                </Link>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

export default Navbar;
