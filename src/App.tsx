import React, { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from './supabase';
import {
  Upload, Copy, Check, Zap, Palette, Table, Layers, AlertCircle,
  ChevronRight, Shield, BarChart3, MousePointer2, Clock, LogIn, Image, RefreshCw, Heart, Twitter, Linkedin, Globe
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ColorInfo {
  hex: string;
  role: 'Background' | 'Primary Data' | 'Secondary Data' | 'Accent' | 'Text' | 'Grid';
  reasoning: string;
  prominence: 'dominant' | 'supporting' | 'accent';
}

interface PaletteResult {
  palette: ColorInfo[];
  overall_style: string;
  colorblind_notes: string;
}

type ColorblindMode = 'none' | 'red-blind' | 'green-blind' | 'blue-blind' | 'monochrome';

// ─── Role colour map ──────────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  'Background':     'bg-slate-100 text-slate-600',
  'Primary Data':   'bg-indigo-100 text-indigo-700',
  'Secondary Data': 'bg-purple-100 text-purple-700',
  'Accent':         'bg-orange-100 text-orange-700',
  'Text':           'bg-gray-800 text-gray-100',
  'Grid':           'bg-gray-100 text-gray-500',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const isLightColor = (hex: string): boolean => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 200;
};

const slugify = (str: string) =>
  str.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  // Auth
  const [session, setSession] = useState<any>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [timeUntilReset, setTimeUntilReset] = useState('');
  const [isSignUpMode, setIsSignUpMode] = useState(false);
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState<{ text: string; type: 'error' | 'success' } | null>(null);

  // Tool
  const [image, setImage] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [wasUpscaled, setWasUpscaled] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<PaletteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedExport, setCopiedExport] = useState<string | null>(null);
  const [colorblindMode, setColorblindMode] = useState<ColorblindMode>('none');
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Auth & session ────────────────────────────────────────────────────────

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchCredits(session.user.id);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchCredits(session.user.id);
      else setCredits(null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Countdown when out of credits
  useEffect(() => {
    if (credits !== 0) return;
    const interval = setInterval(() => {
      const now = new Date();
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const diff = tomorrow.getTime() - now.getTime();
      const h = Math.floor(diff / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);
      setTimeUntilReset(`${h}h ${m}m ${s}s`);
    }, 1000);
    return () => clearInterval(interval);
  }, [credits]);

  const fetchCredits = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('credits, last_reset_date')
      .eq('id', userId)
      .single();

    if (error) { console.error('fetchCredits error:', error); return; }
    if (!data) return;

    // Client-side optimistic reset display (server will also reset on next API call)
    const today = new Date().toISOString().split('T')[0];
    if (!data.last_reset_date || data.last_reset_date < today) {
      setCredits(5);
    } else {
      setCredits(data.credits);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthLoading(true);
    setAuthMessage(null);

    if (isSignUpMode) {
      const { error } = await supabase.auth.signUp({
        email: authEmail,
        password: authPassword,
        options: { data: { full_name: authName } },
      });
      if (error) setAuthMessage({ text: error.message, type: 'error' });
      else {
        setAuthMessage({ text: 'Account created! You can now log in.', type: 'success' });
        setIsSignUpMode(false);
        setAuthName(''); setAuthEmail(''); setAuthPassword('');
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: authPassword,
      });
      if (error) setAuthMessage({ text: error.message, type: 'error' });
    }
    setIsAuthLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setResult(null); setImage(null); setError(null); setCredits(null);
  };

  // ─── Image handling ────────────────────────────────────────────────────────

  const preprocessImage = async (file: File): Promise<{ dataUrl: string; upscaled: boolean }> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new window.Image();
        img.onload = () => {
          let { width, height } = img;
          let upscaled = false;
          if (width < 1000) {
            const ratio = 1500 / width;
            width = 1500;
            height = Math.round(height * ratio);
            upscaled = true;
          }
          const canvas = document.createElement('canvas');
          canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            resolve({ dataUrl: canvas.toDataURL('image/jpeg', 0.92), upscaled });
          } else {
            resolve({ dataUrl: e.target?.result as string, upscaled: false });
          }
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFileUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file (JPG, PNG, WEBP, etc.)');
      return;
    }
    setError(null); setResult(null);
    setFileName(file.name);
    const { dataUrl, upscaled } = await preprocessImage(file);
    setImage(dataUrl);
    setWasUpscaled(upscaled);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }, []);

  // ─── Analysis ──────────────────────────────────────────────────────────────

  const analyzePalette = async () => {
    if (!image || !session || credits === 0) return;
    setIsProcessing(true); setError(null);

    try {
      const base64Data = image.split(',')[1];
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ imageBase64: base64Data }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Analysis failed');

      setResult(data);
      // Refresh credits from DB after deduction
      fetchCredits(session.user.id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // ─── Exports ───────────────────────────────────────────────────────────────

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedExport(key);
    setTimeout(() => setCopiedExport(null), 2000);
  };

  const exportPowerBI = () => {
    if (!result) return;
    const theme = {
      name: 'PaletteIQ Theme',
      dataColors: result.palette.filter((c) => c.role.includes('Data')).map((c) => c.hex),
      background: result.palette.find((c) => c.role === 'Background')?.hex || '#FFFFFF',
      foreground: result.palette.find((c) => c.role === 'Text')?.hex || '#000000',
      tableAccent: result.palette.find((c) => c.role === 'Accent')?.hex || result.palette[0].hex,
    };
    downloadJSON(theme, 'paletteiq-powerbi.json');
  };

  const exportFigma = () => {
    if (!result) return;
    const tokens: Record<string, any> = {};
    result.palette.forEach((color) => {
      const key = slugify(color.role);
      tokens[key] = { value: color.hex, type: 'color', description: color.reasoning };
    });
    downloadJSON(tokens, 'paletteiq-figma-tokens.json');
  };

  const copyCSSVariables = () => {
    if (!result) return;
    const vars = result.palette
      .map((c) => `  --color-${slugify(c.role)}: ${c.hex};`)
      .join('\n');
    copyToClipboard(`:root {\n${vars}\n}`, 'css');
  };

  const copyHexArray = () => {
    if (!result) return;
    copyToClipboard(JSON.stringify(result.palette.map((c) => c.hex)), 'hex');
  };

  const downloadJSON = (data: any, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const exportPaletteImage = () => {
    if (!result) return;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cols = 4;
    const swatchSize = 120;
    const pad = 40;
    const rowH = swatchSize + 120;
    const rows = Math.ceil(result.palette.length / cols);

    canvas.width = cols * (swatchSize + pad * 2) + pad;
    canvas.height = rows * rowH + pad + 120;

    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#0F1117';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PaletteIQ — Color Intelligence', canvas.width / 2, 60);
    ctx.fillStyle = '#6C63FF';
    ctx.font = '14px sans-serif';
    ctx.fillText('paletteiq.vercel.app', canvas.width / 2, 85);

    result.palette.forEach((color, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = pad + col * (swatchSize + pad * 2) + (swatchSize + pad * 2) / 2;
      const cy = 120 + row * rowH + swatchSize / 2;

      // Swatch circle
      ctx.beginPath();
      ctx.arc(cx, cy, swatchSize / 2, 0, Math.PI * 2);
      ctx.fillStyle = color.hex;
      ctx.fill();
      if (isLightColor(color.hex)) {
        ctx.strokeStyle = '#E5E7EB'; ctx.lineWidth = 1.5; ctx.stroke();
      }

      ctx.textAlign = 'center';
      ctx.fillStyle = '#111827';
      ctx.font = 'bold 13px monospace';
      ctx.fillText(color.hex.toUpperCase(), cx, cy + swatchSize / 2 + 22);

      ctx.fillStyle = '#6C63FF';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(color.role.toUpperCase(), cx, cy + swatchSize / 2 + 40);
    });

    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a'); a.href = url; a.download = 'paletteiq-palette.png'; a.click();
  };

  // ─── Colorblind filter ─────────────────────────────────────────────────────

  const getColorblindFilter = () => {
    switch (colorblindMode) {
      case 'red-blind':   return 'url(#protanopia)';
      case 'green-blind': return 'url(#deuteranopia)';
      case 'blue-blind':  return 'url(#tritanopia)';
      case 'monochrome':  return 'grayscale(100%)';
      default:            return 'none';
    }
  };

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col bg-[#F5F4F0] text-[#0F1117] font-sans">

      {/* SVG filters for colorblind simulation */}
      <svg className="hidden" aria-hidden="true">
        <defs>
          <filter id="protanopia">
            <feColorMatrix type="matrix" values="0.567 0.433 0 0 0  0.558 0.442 0 0 0  0 0.242 0.758 0 0  0 0 0 1 0"/>
          </filter>
          <filter id="deuteranopia">
            <feColorMatrix type="matrix" values="0.625 0.375 0 0 0  0.7 0.3 0 0 0  0 0.3 0.7 0 0  0 0 0 1 0"/>
          </filter>
          <filter id="tritanopia">
            <feColorMatrix type="matrix" values="0.95 0.05 0 0 0  0 0.433 0.567 0 0  0 0.475 0.525 0 0  0 0 0 1 0"/>
          </filter>
        </defs>
      </svg>

      {/* ── Nav ──────────────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#6C63FF] rounded-lg flex items-center justify-center">
              <Palette className="text-white w-4 h-4" />
            </div>
            <span className="text-lg font-black tracking-tight">PaletteIQ</span>
          </div>

          <div className="hidden md:flex items-center gap-8">
            {[
              { label: 'How it works', id: 'how-it-works' },
              { label: 'Features', id: 'features' },
              { label: 'Pricing', id: 'pricing' },
            ].map(({ label, id }) => (
              <button
                key={id}
                onClick={() => scrollTo(id)}
                className="text-sm font-medium text-gray-500 hover:text-[#6C63FF] transition-colors"
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-4">
            {session ? (
              <div className="flex items-center gap-4">
                <button
                  onClick={() => scrollTo('tool-dashboard')}
                  className={`hidden md:flex items-center gap-2 px-4 py-1.5 rounded-full border text-sm font-bold transition-all
                    ${credits === 0
                      ? 'bg-red-50 border-red-200 text-red-500'
                      : 'bg-indigo-50 border-indigo-200 text-[#6C63FF] hover:bg-indigo-100'
                    }`}
                >
                  <Zap className="w-3.5 h-3.5" />
                  {credits !== null ? `${credits}/5 Credits` : '…'}
                </button>
                <button
                  onClick={handleLogout}
                  className="text-sm font-bold text-gray-400 hover:text-[#6C63FF] transition-colors"
                >
                  Logout
                </button>
              </div>
            ) : (
              <button
                onClick={() => scrollTo('tool-dashboard')}
                className="px-5 py-2 bg-[#6C63FF] text-white text-sm font-bold rounded-full hover:bg-[#5a52e0] transition-all shadow-lg shadow-indigo-200"
              >
                Get Started Free
              </button>
            )}
          </div>
        </div>
      </nav>

      <main className="flex-1 pt-24">

        {/* ── Hero ───────────────────────────────────────────────────────────── */}
        <section className="max-w-7xl mx-auto px-6 text-center mb-16 pt-10">
          <motion.a
            href="https://linktr.ee/AnalystFemi"
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#6C63FF]/10 rounded-full border border-[#6C63FF]/20 mb-8 hover:bg-[#6C63FF]/20 transition-colors"
          >
            <span className="w-1.5 h-1.5 bg-[#6C63FF] rounded-full animate-pulse" />
            <span className="text-[11px] font-bold text-[#6C63FF] uppercase tracking-wider">By AnalystFemi · Built for Data Pros</span>
          </motion.a>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="text-5xl md:text-7xl font-black tracking-tight leading-[1.08] mb-6"
          >
            Universal Color Intelligence for <br />
            <span className="text-[#6C63FF]">Every Data Visualization</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="text-lg text-gray-500 max-w-xl mx-auto mb-10"
          >
            Upload any dashboard or infographic. Our AI extracts every color, explains its semantic role, and exports it ready for Power BI, Figma, Tableau, or Canva.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="flex items-center justify-center gap-4"
          >
            <button
              onClick={() => scrollTo('tool-dashboard')}
              className="px-8 py-4 bg-[#6C63FF] text-white font-bold rounded-full hover:bg-[#5a52e0] transition-all shadow-xl shadow-indigo-200 flex items-center gap-2"
            >
              Try Free — No Credit Card <ChevronRight className="w-4 h-4" />
            </button>
          </motion.div>
        </section>

        {/* ── Tool Dashboard ─────────────────────────────────────────────────── */}
        <section id="tool-dashboard" className="max-w-6xl mx-auto px-4 md:px-6 mb-32 scroll-mt-24">
          <AnimatePresence mode="wait">
            {!session ? (
              /* ── Auth Card ── */
              <motion.div
                key="auth"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                className="max-w-md mx-auto bg-white rounded-3xl p-10 shadow-2xl border border-gray-100"
              >
                <div className="w-14 h-14 bg-[#6C63FF]/10 rounded-2xl flex items-center justify-center text-[#6C63FF] mx-auto mb-6">
                  <LogIn className="w-7 h-7" />
                </div>
                <h2 className="text-2xl font-black text-center mb-1">
                  {isSignUpMode ? 'Create your account' : 'Welcome back'}
                </h2>
                <p className="text-gray-400 text-sm text-center mb-8">
                  {isSignUpMode ? 'Get 5 free AI extractions every day.' : 'Sign in to access your daily extractions.'}
                </p>

                <form className="space-y-4" onSubmit={handleAuthSubmit}>
                  {isSignUpMode && (
                    <input
                      type="text" placeholder="Full Name" required
                      value={authName} onChange={(e) => setAuthName(e.target.value)}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#6C63FF] outline-none"
                    />
                  )}
                  <input
                    type="email" placeholder="Email address" required
                    value={authEmail} onChange={(e) => setAuthEmail(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#6C63FF] outline-none"
                  />
                  <input
                    type="password" placeholder="Password (min. 6 characters)" required minLength={6}
                    value={authPassword} onChange={(e) => setAuthPassword(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#6C63FF] outline-none"
                  />

                  {authMessage && (
                    <p className={`text-xs font-medium ${authMessage.type === 'error' ? 'text-red-500' : 'text-emerald-600'}`}>
                      {authMessage.text}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={isAuthLoading}
                    className="w-full py-3.5 bg-[#6C63FF] text-white font-bold rounded-xl hover:bg-[#5a52e0] disabled:opacity-50 transition-all"
                  >
                    {isAuthLoading ? 'Loading…' : isSignUpMode ? 'Create Account' : 'Sign In'}
                  </button>
                </form>

                <p className="text-sm text-gray-400 text-center mt-6">
                  {isSignUpMode ? 'Already have an account? ' : "Don't have an account? "}
                  <button
                    onClick={() => { setIsSignUpMode(!isSignUpMode); setAuthMessage(null); }}
                    className="font-bold text-[#6C63FF] hover:underline"
                  >
                    {isSignUpMode ? 'Log In' : 'Sign Up Free'}
                  </button>
                </p>
              </motion.div>
            ) : (
              /* ── Main Tool ── */
              <motion.div
                key="tool"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-3xl overflow-hidden shadow-2xl border border-gray-100"
              >
                <div className="flex flex-col md:flex-row" style={{ minHeight: '680px' }}>

                  {/* Sidebar */}
                  <aside className="w-full md:w-72 border-b md:border-b-0 md:border-r border-gray-100 bg-gray-50/60 p-6 flex flex-col gap-6">
                    
                    {/* Upload zone */}
                    <div>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Upload Visualization</p>
                      <div
                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={onDrop}
                        onClick={() => credits !== 0 && !isProcessing && fileInputRef.current?.click()}
                        className={`relative aspect-video rounded-2xl border-2 border-dashed transition-all overflow-hidden flex items-center justify-center
                          ${credits === 0
                            ? 'border-red-200 bg-red-50 cursor-not-allowed'
                            : isDragging
                            ? 'border-[#6C63FF] bg-indigo-50 cursor-pointer'
                            : 'border-gray-200 bg-white hover:bg-gray-50 cursor-pointer'
                          }`}
                      >
                        <input
                          type="file"
                          ref={fileInputRef}
                          className="hidden"
                          accept="image/*"
                          onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                          disabled={credits === 0 || isProcessing}
                        />
                        {image ? (
                          <>
                            <img src={image} className="w-full h-full object-cover" alt="uploaded" />
                            {isProcessing && (
                              <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
                                <div className="w-8 h-8 border-2 border-[#6C63FF]/20 border-t-[#6C63FF] rounded-full animate-spin" />
                                <span className="text-xs font-bold text-[#6C63FF]">Analyzing…</span>
                              </div>
                            )}
                            {wasUpscaled && !isProcessing && (
                              <div className="absolute top-2 right-2 px-2 py-0.5 bg-emerald-500 text-white text-[9px] font-bold rounded-full">
                                Enhanced
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="flex flex-col items-center gap-2 text-gray-300">
                            {credits === 0
                              ? <Clock className="w-8 h-8 text-red-300" />
                              : <Upload className="w-8 h-8" />
                            }
                            <span className="text-[10px] font-bold uppercase tracking-wide">
                              {credits === 0 ? 'Limit Reached' : 'Drop image here'}
                            </span>
                            {credits !== 0 && (
                              <span className="text-[9px] text-gray-300">JPG · PNG · WEBP · SVG</span>
                            )}
                          </div>
                        )}
                      </div>
                      {fileName && (
                        <p className="text-[10px] text-gray-400 mt-1.5 truncate" title={fileName}>
                          {fileName}
                        </p>
                      )}
                    </div>

                    {/* Analyze button */}
                    {image && !result && !isProcessing && (
                      <button
                        onClick={analyzePalette}
                        disabled={credits === 0}
                        className={`w-full py-3.5 font-bold rounded-xl transition-all flex items-center justify-center gap-2
                          ${credits === 0
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            : 'bg-[#6C63FF] text-white hover:bg-[#5a52e0] shadow-lg shadow-indigo-200'
                          }`}
                      >
                        <Zap className="w-4 h-4" />
                        {credits === 0 ? 'No Credits' : `Analyze  ·  ${credits} left`}
                      </button>
                    )}

                    {/* Colorblind modes */}
                    {result && (
                      <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Accessibility Preview</p>
                        <div className="flex flex-wrap gap-1.5">
                          {(['none', 'red-blind', 'green-blind', 'blue-blind', 'monochrome'] as ColorblindMode[]).map((mode) => (
                            <button
                              key={mode}
                              onClick={() => setColorblindMode(mode)}
                              className={`px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wide transition-all
                                ${colorblindMode === mode
                                  ? 'bg-[#6C63FF] text-white'
                                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                }`}
                            >
                              {mode === 'none' ? 'Normal' : mode.replace('-', ' ')}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Export buttons */}
                    {result && (
                      <div className="space-y-2 mt-auto">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Export</p>
                        <button
                          onClick={exportPowerBI}
                          className="w-full py-2.5 bg-yellow-50 text-yellow-700 border border-yellow-200 text-xs font-bold rounded-xl hover:bg-yellow-100 transition-all flex items-center justify-center gap-2"
                        >
                          <Table className="w-3.5 h-3.5" /> Power BI JSON
                        </button>
                        <button
                          onClick={exportFigma}
                          className="w-full py-2.5 bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-bold rounded-xl hover:bg-indigo-100 transition-all flex items-center justify-center gap-2"
                        >
                          <Layers className="w-3.5 h-3.5" /> Figma Tokens
                        </button>
                        <button
                          onClick={copyCSSVariables}
                          className="w-full py-2.5 bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold rounded-xl hover:bg-slate-100 transition-all flex items-center justify-center gap-2"
                        >
                          {copiedExport === 'css' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                          {copiedExport === 'css' ? 'Copied!' : 'CSS Variables'}
                        </button>
                        <button
                          onClick={copyHexArray}
                          className="w-full py-2.5 bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold rounded-xl hover:bg-slate-100 transition-all flex items-center justify-center gap-2"
                        >
                          {copiedExport === 'hex' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                          {copiedExport === 'hex' ? 'Copied!' : 'Hex Array'}
                        </button>
                        <button
                          onClick={exportPaletteImage}
                          className="w-full py-2.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-xl hover:bg-emerald-100 transition-all flex items-center justify-center gap-2"
                        >
                          <Image className="w-3.5 h-3.5" /> Export as PNG
                        </button>
                        <button
                          onClick={() => { setResult(null); setImage(null); setError(null); setFileName(''); setWasUpscaled(false); }}
                          className="w-full py-2.5 bg-gray-100 text-gray-500 text-xs font-bold rounded-xl hover:bg-gray-200 transition-all flex items-center justify-center gap-2 mt-2"
                        >
                          <RefreshCw className="w-3.5 h-3.5" /> Start Over
                        </button>
                      </div>
                    )}
                  </aside>

                  {/* Main panel */}
                  <div className="flex-1 bg-white flex flex-col overflow-hidden">
                    <AnimatePresence mode="wait">

                      {credits === 0 && !result ? (
                        <motion.div key="nocredits" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                          className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                          <div className="w-16 h-16 bg-red-50 rounded-3xl flex items-center justify-center text-red-400 mb-6">
                            <Clock className="w-8 h-8" />
                          </div>
                          <h3 className="text-xl font-black mb-2">Daily Limit Reached</h3>
                          <p className="text-gray-400 text-sm max-w-xs mb-4">
                            You've used all 5 free extractions for today. Credits reset at midnight.
                          </p>
                          <div className="text-4xl font-black text-[#6C63FF] mb-8 font-mono">{timeUntilReset}</div>
                          <button
                            onClick={() => scrollTo('pricing')}
                            className="px-8 py-3.5 bg-[#6C63FF] text-white font-bold rounded-full hover:bg-[#5a52e0] transition-all shadow-lg shadow-indigo-200"
                          >
                            Upgrade to Pro →
                          </button>
                        </motion.div>

                      ) : error ? (
                        <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                          className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                          <div className="w-16 h-16 bg-red-50 rounded-3xl flex items-center justify-center text-red-400 mb-6">
                            <AlertCircle className="w-8 h-8" />
                          </div>
                          <h3 className="text-xl font-black mb-2">Analysis Failed</h3>
                          <p className="text-gray-400 text-sm max-w-xs mb-6">{error}</p>
                          <button
                            onClick={() => setError(null)}
                            className="px-6 py-3 bg-gray-100 text-gray-600 font-bold rounded-xl hover:bg-gray-200 transition-all"
                          >
                            Try Again
                          </button>
                        </motion.div>

                      ) : !result ? (
                        <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                          className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                          <div className="w-20 h-20 bg-[#6C63FF]/5 rounded-3xl flex items-center justify-center text-[#6C63FF] mb-6">
                            <Palette className="w-10 h-10" />
                          </div>
                          <h2 className="text-2xl font-black mb-3">Ready to extract colors</h2>
                          <p className="text-gray-400 max-w-sm text-sm">
                            Upload any dashboard screenshot, chart, or infographic to get an AI-powered color intelligence report.
                          </p>
                          <div className="mt-8 flex flex-wrap justify-center gap-2">
                            {['Power BI', 'Tableau', 'Excel', 'Figma', 'Canva', 'Looker'].map((tool) => (
                              <span key={tool} className="px-3 py-1 bg-gray-100 text-gray-500 text-xs font-bold rounded-full">
                                {tool}
                              </span>
                            ))}
                          </div>
                        </motion.div>

                      ) : (
                        /* Results */
                        <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                          className="flex-1 p-6 md:p-10 overflow-y-auto"
                          style={{ filter: getColorblindFilter() }}
                        >
                          <div className="text-center mb-8">
                            <h2 className="text-2xl font-black tracking-tight mb-1">Extracted Palette</h2>
                            <span className="inline-flex items-center gap-1 px-3 py-1 bg-[#6C63FF]/10 text-[#6C63FF] rounded-full text-[10px] font-black uppercase tracking-widest">
                              <Zap className="w-3 h-3" /> {result.palette.length} Colors Identified
                            </span>
                          </div>

                          {/* Swatches grid */}
                          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-5 mb-10">
                            {result.palette.map((color, idx) => (
                              <motion.div
                                key={idx}
                                initial={{ opacity: 0, scale: 0.7 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: idx * 0.04 }}
                                className="flex flex-col items-center group"
                              >
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(color.hex);
                                    setCopiedIndex(idx);
                                    setTimeout(() => setCopiedIndex(null), 2000);
                                  }}
                                  title={`Copy ${color.hex}`}
                                  className={`w-14 h-14 md:w-16 md:h-16 rounded-2xl shadow-md transition-all hover:scale-110 active:scale-95 flex items-center justify-center
                                    ${isLightColor(color.hex) ? 'ring-1 ring-gray-200' : ''}`}
                                  style={{ backgroundColor: color.hex }}
                                >
                                  <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                                    {copiedIndex === idx
                                      ? <Check className="w-4 h-4 text-white mix-blend-difference" />
                                      : <Copy className="w-4 h-4 text-white mix-blend-difference" />
                                    }
                                  </span>
                                </button>

                                <div className="mt-2.5 text-center w-full">
                                  <p className="text-[11px] font-black tracking-tight uppercase">{color.hex}</p>
                                  <span className={`inline-block mt-1 px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wide ${ROLE_COLORS[color.role] ?? 'bg-gray-100 text-gray-500'}`}>
                                    {color.role}
                                  </span>
                                  <p className="text-[9px] text-gray-400 leading-snug mt-1.5 px-0.5 line-clamp-3 group-hover:line-clamp-none transition-all">
                                    {color.reasoning}
                                  </p>
                                </div>
                              </motion.div>
                            ))}
                          </div>

                          {/* AI Insights */}
                          <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">AI Insights</p>
                            <p className="text-sm text-gray-700 leading-relaxed">{result.overall_style}</p>
                            <div className="mt-4 pt-4 border-t border-gray-200 flex items-start gap-2 text-amber-600">
                              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                              <p className="text-xs font-medium leading-relaxed">{result.colorblind_notes}</p>
                            </div>
                          </div>
                        </motion.div>
                      )}

                    </AnimatePresence>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* ── How it works ───────────────────────────────────────────────────── */}
        <section id="how-it-works" className="max-w-7xl mx-auto px-6 mb-32 scroll-mt-24">
          <div className="text-center mb-16">
            <span className="text-[#6C63FF] font-black text-xs uppercase tracking-widest">Simple Process</span>
            <h2 className="text-4xl font-black mt-3 mb-4">Extract a palette in 3 steps</h2>
            <p className="text-gray-400 max-w-lg mx-auto text-sm">No design skills needed. Upload, analyze, and export in under 30 seconds.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {[
              {
                step: '01',
                title: 'Upload your visualization',
                desc: 'Drag and drop any dashboard screenshot, infographic export, or chart image. JPG, PNG, and WEBP all supported.',
              },
              {
                step: '02',
                title: 'AI analyzes color roles',
                desc: 'Our AI identifies every intentional color, assigns it a semantic role (Background, Primary Data, Accent…), and explains the design intent.',
              },
              {
                step: '03',
                title: 'Export to your tool',
                desc: 'Download Power BI JSON, Figma Tokens, CSS variables, or a shareable PNG palette — ready to use instantly.',
              },
            ].map((item, i) => (
              <div key={i} className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                <div className="text-4xl font-black text-[#6C63FF]/20 mb-4">{item.step}</div>
                <h3 className="text-lg font-black mb-3">{item.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Features ───────────────────────────────────────────────────────── */}
        <section id="features" className="max-w-7xl mx-auto px-6 mb-32 scroll-mt-24">
          <div className="text-center mb-16">
            <span className="text-[#6C63FF] font-black text-xs uppercase tracking-widest">Features</span>
            <h2 className="text-4xl font-black mt-3 mb-4">Built for data professionals</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              {
                icon: <Zap className="w-6 h-6" />,
                title: 'Semantic Role Extraction',
                desc: "The AI doesn't just extract colors — it tells you which is the Background, which is Primary Data, which is an Alert Accent. Roles you can act on immediately.",
              },
              {
                icon: <Shield className="w-6 h-6" />,
                title: 'Colorblind Accessibility Check',
                desc: 'Every palette is assessed for red-green and blue-yellow colorblindness. Toggle simulations on-screen and get plain-language advice.',
              },
              {
                icon: <BarChart3 className="w-6 h-6" />,
                title: 'Tool-Ready Export Formats',
                desc: 'One click exports your palette to Power BI JSON, Figma Tokens, CSS custom properties, or a flat hex array for Excel and Tableau.',
              },
              {
                icon: <MousePointer2 className="w-6 h-6" />,
                title: 'Automatic Image Enhancement',
                desc: 'Low-resolution screenshots are automatically upscaled before analysis, ensuring accurate hex extraction even from compressed exports.',
              },
            ].map((f, i) => (
              <div key={i} className="p-8 bg-white rounded-3xl border border-gray-100 shadow-sm hover:shadow-lg transition-all group">
                <div className="w-12 h-12 bg-[#6C63FF]/8 rounded-2xl flex items-center justify-center text-[#6C63FF] mb-5 group-hover:bg-[#6C63FF]/15 transition-colors">
                  {f.icon}
                </div>
                <h3 className="text-lg font-black mb-2">{f.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Pricing ────────────────────────────────────────────────────────── */}
        <section id="pricing" className="max-w-7xl mx-auto px-6 mb-32 scroll-mt-24">
          <div className="text-center mb-16">
            <span className="text-[#6C63FF] font-black text-xs uppercase tracking-widest">Pricing</span>
            <h2 className="text-4xl font-black mt-3 mb-4">Simple, transparent plans</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
            {/* Free */}
            <div className="p-8 bg-white rounded-3xl border border-gray-100 shadow-sm">
              <h3 className="text-lg font-black mb-1">Free</h3>
              <p className="text-gray-400 text-sm mb-6">For analysts and students getting started.</p>
              <div className="text-4xl font-black mb-6">$0<span className="text-base font-normal text-gray-400">/forever</span></div>
              <ul className="space-y-3 mb-8">
                {['5 AI Extractions per day', 'Power BI, Figma & PNG export', 'Colorblind accessibility check', 'Automatic image enhancement'].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-sm text-gray-600">
                    <Check className="w-4 h-4 text-[#6C63FF] shrink-0" /> {item}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => scrollTo('tool-dashboard')}
                className="w-full py-3.5 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-all"
              >
                {session ? 'Current Plan' : 'Get Started Free'}
              </button>
            </div>

            {/* Pro */}
            <div className="p-8 bg-[#6C63FF] rounded-3xl shadow-xl relative overflow-hidden">
              <span className="inline-block mb-4 px-3 py-1 bg-white/20 text-white text-[10px] font-black uppercase tracking-widest rounded-full">
                Coming Soon
              </span>
              <h3 className="text-lg font-black text-white mb-1">Pro Analyst</h3>
              <p className="text-indigo-200 text-sm mb-6">For professionals building daily dashboards.</p>
              <div className="flex items-baseline gap-2 mb-6">
                <div className="text-4xl font-black text-white">$2.99<span className="text-base font-normal text-indigo-200">/mo</span></div>
                <div className="text-sm text-indigo-300">or $29.99/yr</div>
              </div>
              <ul className="space-y-3 mb-8">
                {['Unlimited daily extractions', 'Priority API processing', 'Saved palette history', 'Team sharing'].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-sm text-indigo-100">
                    <Check className="w-4 h-4 text-white shrink-0" /> {item}
                  </li>
                ))}
              </ul>
              <a
                href="mailto:analystfemi@gmail.com?subject=PaletteIQ Pro - Notify Me&body=Hi, I'd like to be notified when PaletteIQ Pro launches."
                className="block w-full py-3.5 bg-white text-[#6C63FF] font-bold rounded-xl text-center hover:bg-indigo-50 transition-all"
              >
                Notify Me When Live
              </a>
            </div>
          </div>
        </section>

      </main>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <footer className="bg-[#0F1117] text-white">
        <div className="max-w-7xl mx-auto px-6 py-16 grid grid-cols-1 md:grid-cols-3 gap-12">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 bg-[#6C63FF] rounded-lg flex items-center justify-center">
                <Palette className="w-4 h-4 text-white" />
              </div>
              <span className="text-lg font-black">PaletteIQ</span>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed mb-6 max-w-xs">
              The ultimate color intelligence tool for data professionals. Extract, analyze, and export professional palettes from any dashboard in seconds.
            </p>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span>Made with</span>
              <Heart className="w-3.5 h-3.5 text-red-400 fill-red-400" />
              <span>by</span>
              <a
                href="https://linktr.ee/AnalystFemi"
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-[#6C63FF] hover:underline"
              >
                AnalystFemi
              </a>
            </div>
          </div>

          {/* Quick links */}
          <div>
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-5">Quick Links</p>
            <ul className="space-y-3">
              {[
                { label: 'How it works', id: 'how-it-works' },
                { label: 'Features', id: 'features' },
                { label: 'Pricing', id: 'pricing' },
                { label: 'Try the tool', id: 'tool-dashboard' },
              ].map(({ label, id }) => (
                <li key={id}>
                  <button
                    onClick={() => scrollTo(id)}
                    className="text-gray-400 hover:text-white text-sm transition-colors"
                  >
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Social */}
          <div>
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-5">Connect</p>
            <div className="flex items-center gap-4">
              <a
                href="https://linktr.ee/AnalystFemi"
                target="_blank"
                rel="noopener noreferrer"
                title="Linktree"
                className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#6C63FF] transition-all"
              >
                <Globe className="w-4 h-4" />
              </a>
              <a
                href="https://twitter.com/AnalystFemi"
                target="_blank"
                rel="noopener noreferrer"
                title="Twitter / X"
                className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#6C63FF] transition-all"
              >
                <Twitter className="w-4 h-4" />
              </a>
              <a
                href="https://www.linkedin.com/in/analystfemi"
                target="_blank"
                rel="noopener noreferrer"
                title="LinkedIn"
                className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#6C63FF] transition-all"
              >
                <Linkedin className="w-4 h-4" />
              </a>
            </div>

            <div className="mt-8 p-4 bg-white/5 rounded-2xl border border-white/10">
              <p className="text-xs text-gray-400 leading-relaxed">
                PaletteIQ is a free tool for the data visualization community. If it saves you time, share it with a colleague. 🎨
              </p>
            </div>
          </div>
        </div>

        <div className="border-t border-white/10">
          <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-gray-500 text-xs">© 2026 PaletteIQ · Built by AnalystFemi · All rights reserved.</p>
            <div className="flex items-center gap-6">
              <a href="https://paletteiq.vercel.app" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-gray-300 text-xs transition-colors">
                paletteiq.vercel.app
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}