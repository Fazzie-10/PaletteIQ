/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useCallback } from 'react';
import { GoogleGenAI } from "@google/genai";
import { 
  Upload, 
  Copy, 
  Check, 
  Zap, 
  Palette, 
  Table, 
  Layers,
  AlertCircle,
  X,
  Star,
  Users,
  Shield,
  BarChart3,
  MousePointer2,
  ChevronRight,
  Twitter,
  Facebook,
  Instagram,
  Music2
} from 'lucide-react';
import { motion } from 'motion/react';

// --- Types ---

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

type ColorblindMode = 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia' | 'achromatopsia';

// --- Constants ---

const GEMINI_PROMPT = `Analyze this data visualization. Extract 4–10 dominant colors. Return ONLY a JSON object:
{
"palette": [{ 
  "hex": "#RRGGBB", 
  "role": "Background|Primary Data|Secondary Data|Accent|Text|Grid", 
  "reasoning": "Explain exactly what this color represents in the visualization (e.g., 'Used for the Finance sector bars', 'Represents the growth trend line', etc.)", 
  "prominence": "dominant|supporting|accent" 
}],
"overall_style": "Summarize the overall design aesthetic and color theory used.",
"colorblind_notes": "Provide specific accessibility advice for this palette."
}`;

// --- Components ---

const Navbar = () => (
  <nav className="fixed top-0 left-0 right-0 z-50 bg-white/70 backdrop-blur-md border-b border-gray-100">
    <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-brand-primary rounded-lg flex items-center justify-center shadow-lg shadow-brand-primary/20">
          <Palette className="text-white w-5 h-5" />
        </div>
        <span className="text-lg font-bold tracking-tight text-text-main">PaletteIQ</span>
      </div>
      
      <div className="hidden md:flex items-center gap-8">
        {['How it works', 'Features', 'About Us'].map((item) => (
          <a key={item} href={`#${item.toLowerCase().replace(/\s+/g, '-')}`} className="text-sm font-medium text-text-muted hover:text-brand-primary transition-colors">
            {item}
          </a>
        ))}
      </div>

      <div className="flex items-center gap-4">
        <button className="px-5 py-2 bg-brand-primary text-white text-sm font-bold rounded-full shadow-lg shadow-brand-primary/20 hover:bg-brand-secondary transition-all active:scale-95">
          Get Started
        </button>
      </div>
    </div>
  </nav>
);

export default function App() {
  // State
  const [image, setImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<PaletteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  
  // Mobile Interaction State
  const [expandedSwatch, setExpandedSwatch] = useState<number | null>(null);
  
  const [colorblindMode, setColorblindMode] = useState<ColorblindMode>('none');
  const [isDragging, setIsDragging] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Logic ---

  const handleCopy = (text: string, index?: number) => {
    navigator.clipboard.writeText(text);
    if (index !== undefined) {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    }
  };

  const preprocessImage = async (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          if (width < 1000) {
            const ratio = 1500 / width;
            width = 1500;
            height = height * ratio;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.9));
          } else {
            resolve(e.target?.result as string);
          }
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFileUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file.');
      return;
    }
    setError(null);
    setResult(null);
    setExpandedSwatch(null);
    
    const processedDataUrl = await preprocessImage(file);
    setImage(processedDataUrl);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }, []);

  const isLightColor = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 220;
  };

  const analyzePalette = async () => {
    if (!image) return;

    setIsProcessing(true);
    setError(null);
    setExpandedSwatch(null);

    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

    if (!apiKey) {
      setError('API key not configured. Please contact the site owner.');
      setIsProcessing(false);
      return;
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      const base64Data = image.split(',')[1];

      const response = await ai.models.generateContent({
        // Utilizing the 500 RPD 3.1-flash-lite model for high quota stability
        model: "gemini-3.1-flash-lite-preview",
        contents: [
          {
            parts: [
              { text: GEMINI_PROMPT },
              {
                inlineData: {
                  data: base64Data,
                  mimeType: "image/jpeg"
                }
              }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json", 
        }
      });

      const responseText = response.text;
      if (!responseText) throw new Error('Empty response from AI.');

      const parsed = JSON.parse(responseText) as PaletteResult;
      
      if (!parsed.palette || !Array.isArray(parsed.palette)) {
        throw new Error('Invalid palette structure returned.');
      }
      setResult(parsed);
      
    } catch (err: any) {
      console.error(err);
      setError(
        err.message?.includes('quota')
          ? 'API quota exceeded. Please try again in a few minutes.'
          : err.message || 'Analysis failed. Please try a clearer image.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const exportPowerBI = () => {
    if (!result) return;
    const theme = {
      name: "PaletteIQ Theme",
      dataColors: result.palette.filter(c => c.role.includes('Data')).map(c => c.hex),
      background: result.palette.find(c => c.role === 'Background')?.hex || "#FFFFFF",
      foreground: result.palette.find(c => c.role === 'Text')?.hex || "#000000",
      tableAccent: result.palette.find(c => c.role === 'Accent')?.hex || result.palette[0].hex
    };
    const blob = new Blob([JSON.stringify(theme, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'paletteiq-powerbi.json';
    a.click();
  };

  const exportPaletteImage = () => {
    if (!result) return;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const swatchSize = 140;
    const padding = 60;
    const columns = 4;
    const rows = Math.ceil(result.palette.length / columns);
    const rowHeight = swatchSize + 180;
    
    canvas.width = columns * (swatchSize + padding * 2) + padding;
    canvas.height = rows * rowHeight + padding + 150;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#0F1117';
    ctx.font = 'bold 42px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PaletteIQ Color Intelligence', canvas.width / 2, 80);

    result.palette.forEach((color, i) => {
      const col = i % columns;
      const row = Math.floor(i / columns);
      const x = padding + col * (swatchSize + padding * 2) + (swatchSize + padding * 2) / 2;
      const y = padding + 150 + row * rowHeight + swatchSize / 2;

      ctx.beginPath();
      ctx.arc(x, y, swatchSize / 2, 0, Math.PI * 2);
      ctx.fillStyle = color.hex;
      ctx.fill();

      if (isLightColor(color.hex)) {
        ctx.strokeStyle = '#E5E7EB';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.fillStyle = '#111827';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText(color.hex.toUpperCase(), x, y + swatchSize / 2 + 35);
      
      ctx.fillStyle = '#4F46E5';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText(color.role.toUpperCase(), x, y + swatchSize / 2 + 60);

      ctx.fillStyle = '#6B7280';
      ctx.font = '12px sans-serif';
      const words = color.reasoning.split(' ');
      let line = '';
      let lineCount = 0;
      const maxWidth = swatchSize + 40;
      
      for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && n > 0) {
          ctx.fillText(line, x, y + swatchSize / 2 + 85 + (lineCount * 18));
          line = words[n] + ' ';
          lineCount++;
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line, x, y + swatchSize / 2 + 85 + (lineCount * 18));
    });

    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = 'paletteiq-export.png';
    a.click();
  };

  const exportFigma = () => {
    if (!result) return;
    const tokens = result.palette.reduce((acc: any, color) => {
      acc[color.role.toLowerCase().replace(' ', '-')] = {
        value: color.hex,
        type: "color",
        description: color.reasoning
      };
      return acc;
    }, {});
    const blob = new Blob([JSON.stringify(tokens, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'paletteiq-figma.json';
    a.click();
  };

  const copyAllHex = () => {
    if (!result) return;
    const hexList = result.palette.map(c => c.hex).join(', ');
    handleCopy(hexList);
  };

  const getColorblindFilter = () => {
    switch (colorblindMode) {
      case 'protanopia': return 'url(#protanopia)';
      case 'deuteranopia': return 'url(#deuteranopia)';
      case 'tritanopia': return 'url(#tritanopia)';
      case 'achromatopsia': return 'grayscale(100%)';
      default: return 'none';
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-bg-light text-text-main font-sans selection:bg-brand-primary/20">
      <Navbar />

      {/* SVG Filters for Colorblind Simulation */}
      <svg className="hidden">
        <filter id="protanopia">
          <feColorMatrix type="matrix" values="0.567, 0.433, 0, 0, 0, 0.558, 0.442, 0, 0, 0, 0, 0.242, 0.758, 0, 0, 0, 0, 0, 1, 0" />
        </filter>
        <filter id="deuteranopia">
          <feColorMatrix type="matrix" values="0.625, 0.375, 0, 0, 0, 0.7, 0.3, 0, 0, 0, 0, 0.3, 0.7, 0, 0, 0, 0, 0, 1, 0" />
        </filter>
        <filter id="tritanopia">
          <feColorMatrix type="matrix" values="0.95, 0.05, 0, 0, 0, 0, 0.433, 0.567, 0, 0, 0, 0, 0.475, 0.525, 0, 0, 0, 0, 0, 1, 0" />
        </filter>
      </svg>

      <main className="flex-1 pt-32">
        {/* Hero Section */}
        <section className="max-w-7xl mx-auto px-6 text-center mb-16 md:mb-20">
          <motion.a
            href="https://linktr.ee/AnalystFemi"
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-3 py-1 bg-brand-primary/10 rounded-full border border-brand-primary/20 mb-8 hover:bg-brand-primary/20 transition-colors cursor-pointer"
          >
            <div className="w-1.5 h-1.5 bg-brand-primary rounded-full animate-pulse" />
            <span className="text-[11px] font-bold text-brand-primary uppercase tracking-wider">By AnalystFemi</span>
          </motion.a>
          
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-7xl font-extrabold tracking-tight text-text-main mb-6 md:mb-8 leading-[1.1]"
          >
            Universal Color Intelligence for <br />
            <span className="gradient-text">Every Data Visualization</span>
          </motion.h1>
          
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-base md:text-lg text-text-muted max-w-2xl mx-auto mb-8 md:mb-10"
          >
            Extract professional palettes from dashboards, infographics, and charts. The ultimate color intelligence tool for Power BI, Excel, Tableau, Canva, and Figma.
          </motion.p>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-col sm:flex-row justify-center gap-4"
          >
            <button onClick={() => document.getElementById('tool-dashboard')?.scrollIntoView({ behavior: 'smooth' })} className="px-8 py-4 bg-brand-primary text-white font-bold rounded-full shadow-xl shadow-brand-primary/30 hover:bg-brand-secondary transition-all active:scale-95 flex items-center justify-center gap-2">
              Get Started <ChevronRight className="w-4 h-4" />
            </button>
            <button 
              onClick={() => document.getElementById('how-to-use')?.scrollIntoView({ behavior: 'smooth' })}
              className="px-8 py-4 bg-white text-text-main font-bold rounded-full border border-gray-200 hover:bg-gray-50 transition-all active:scale-95"
            >
              How to Use
            </button>
          </motion.div>
        </section>

        {/* 3-Step Process Section */}
        <section id="how-to-use" className="max-w-7xl mx-auto px-6 mb-32 scroll-mt-32">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-extrabold mb-4">How to Extract a Professional Palette in 3 Steps</h2>
            <p className="text-text-muted">Learn how to extract and apply professional colors to any visualization with our AI-powered tool.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative">
            <div className="hidden md:block absolute top-12 left-1/4 right-1/4 h-0.5 bg-gray-100 -z-10" />
            {[
              { step: '1', title: 'Choose your source', desc: 'Select from pre-built palettes or upload any visualization image (dashboard, infographic, or chart) to extract a custom color scheme with AI.' },
              { step: '2', title: 'Analyze Intelligence', desc: 'Our AI automatically identifies semantic roles and usage context for every color, ensuring your design is data-driven.' },
              { step: '3', title: 'Export & Apply', desc: 'Download your palette as a Power BI JSON, Figma Tokens, or a professional PNG for Excel, Tableau, and Canva.' }
            ].map((item, i) => (
              <div key={i} className="text-center">
                <div className="w-16 h-16 bg-white border-2 border-brand-primary rounded-full flex items-center justify-center text-2xl font-black text-brand-primary mx-auto mb-6 shadow-lg">
                  {item.step}
                </div>
                <h3 className="text-xl font-bold mb-4">{item.title}</h3>
                <p className="text-text-muted text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Tool Dashboard */}
        <section id="tool-dashboard" className="max-w-6xl mx-auto px-4 md:px-6 mb-32">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4, type: "spring", stiffness: 100 }}
            className="glass-card rounded-[2rem] md:rounded-[2.5rem] overflow-hidden shadow-2xl shadow-indigo-500/10 border border-white"
          >
            <div className="flex flex-col md:flex-row h-auto md:h-[700px] min-h-min md:min-h-[600px]">
              {/* Tool Sidebar */}
              <aside className="w-full md:w-80 border-b md:border-b-0 md:border-r border-gray-100 bg-white/50 p-6 md:p-8 flex flex-col gap-6 md:gap-8">
                <div>
                  <h3 className="text-xs font-bold text-text-muted uppercase tracking-widest mb-6">Source Analysis</h3>
                  <div 
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={onDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`
                      relative aspect-video rounded-2xl border-2 border-dashed transition-all cursor-pointer overflow-hidden flex items-center justify-center
                      ${isDragging ? 'border-brand-primary bg-brand-primary/5' : 'border-gray-200 bg-gray-50 hover:bg-gray-100'}
                    `}
                  >
                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])} />
                    {image ? (
                      <img src={image} alt="Source" className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-gray-400">
                        <Upload className="w-6 h-6" />
                        <span className="text-[10px] font-bold uppercase">Upload Image</span>
                      </div>
                    )}
                    {isProcessing && (
                      <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center">
                        <div className="w-8 h-8 border-2 border-brand-primary/20 border-t-brand-primary rounded-full animate-spin" />
                      </div>
                    )}
                  </div>
                </div>

                {result && (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-xs font-bold text-text-muted uppercase tracking-widest mb-4">Tool-Ready Exports</h3>
                      <div className="grid grid-cols-1 gap-3">
                        <button onClick={exportPowerBI} className="flex items-center gap-3 p-3 bg-white border border-gray-100 rounded-xl hover:border-brand-primary transition-all group">
                          <div className="w-8 h-8 bg-yellow-500/10 rounded-lg flex items-center justify-center text-yellow-500"><Table className="w-4 h-4" /></div>
                          <div className="text-left"><p className="text-xs font-bold">Power BI</p></div>
                        </button>
                        <button onClick={exportPaletteImage} className="flex items-center gap-3 p-3 bg-white border border-gray-100 rounded-xl hover:border-brand-primary transition-all group">
                          <div className="w-8 h-8 bg-emerald-500/10 rounded-lg flex items-center justify-center text-emerald-500"><Copy className="w-4 h-4" /></div>
                          <div className="text-left"><p className="text-xs font-bold">Excel/Canva</p></div>
                        </button>
                        <button onClick={exportFigma} className="flex items-center gap-3 p-3 bg-white border border-gray-100 rounded-xl hover:border-brand-primary transition-all group">
                          <div className="w-8 h-8 bg-indigo-500/10 rounded-lg flex items-center justify-center text-indigo-400"><Layers className="w-4 h-4" /></div>
                          <div className="text-left"><p className="text-xs font-bold">Figma</p></div>
                        </button>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-xs font-bold text-text-muted uppercase tracking-widest mb-4">Accessibility</h3>
                      <div className="flex flex-wrap gap-2">
                        {(['none', 'protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia'] as ColorblindMode[]).map((mode) => (
                          <button
                            key={mode}
                            onClick={() => setColorblindMode(mode)}
                            className={`px-2 py-1 rounded-lg text-[9px] font-bold uppercase transition-all ${colorblindMode === mode ? 'bg-brand-primary text-white' : 'bg-gray-100 text-text-muted hover:bg-gray-200'}`}
                          >
                            {mode === 'none' ? 'Normal' : mode}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-auto">
                  {!result && image && !isProcessing && (
                    <button onClick={analyzePalette} className="w-full py-4 bg-brand-primary text-white font-bold rounded-2xl shadow-lg shadow-brand-primary/20 hover:bg-brand-secondary transition-all">
                      Analyze Palette
                    </button>
                  )}
                  {result && (
                    <button onClick={() => { setResult(null); setImage(null); setError(null); setExpandedSwatch(null); }} className="w-full py-4 bg-gray-100 text-text-muted font-bold rounded-2xl hover:bg-gray-200 transition-all">
                      Start Over
                    </button>
                  )}
                </div>
              </aside>

              {/* Tool Main Area */}
              <div className="flex-1 bg-white flex flex-col overflow-hidden">
                {error ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                    <div className="w-16 h-16 bg-red-50 rounded-3xl flex items-center justify-center text-red-500 mb-6">
                      <AlertCircle className="w-8 h-8" />
                    </div>
                    <h3 className="font-bold text-text-main mb-2">Analysis Failed</h3>
                    <p className="text-text-muted text-sm max-w-xs">{error}</p>
                    <button
                      onClick={() => setError(null)}
                      className="mt-6 px-6 py-3 bg-brand-primary text-white text-sm font-bold rounded-full"
                    >
                      Try Again
                    </button>
                  </div>
                ) : !result ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                    <div className="w-20 h-20 bg-brand-primary/5 rounded-3xl flex items-center justify-center text-brand-primary mb-6">
                      <Palette className="w-10 h-10" />
                    </div>
                    <h2 className="text-2xl font-bold mb-4">Ready to extract intelligence?</h2>
                    <p className="text-text-muted max-w-sm">Upload a dashboard or chart to see the AI analyze semantic roles and accessibility.</p>
                  </div>
                ) : (
                  <div className="flex-1 p-6 md:p-12 overflow-y-auto bg-gray-50/30" style={{ filter: getColorblindFilter() }}>
                    <div className="text-center mb-8 md:mb-12">
                      <h2 className="text-2xl md:text-3xl font-black tracking-tight mb-2">Extracted Palette</h2>
                      <p className="text-text-muted text-sm">{result.palette.length} Color Swatches Identified</p>
                    </div>
                    
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-y-8 md:gap-y-12 gap-x-4 md:gap-x-8">
                      {result.palette.map((color, idx) => (
                        <motion.div
                          key={idx}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: idx * 0.05 }}
                          className="flex flex-col items-center group"
                        >
                          {/* Color Swatch (Copies Hex on click) */}
                          <div 
                            onClick={() => handleCopy(color.hex, idx)}
                            className={`
                              w-16 h-16 md:w-24 md:h-24 rounded-full shadow-lg cursor-pointer transition-transform hover:scale-110 active:scale-95 relative flex items-center justify-center
                              ${isLightColor(color.hex) ? 'border border-gray-200' : ''}
                            `}
                            style={{ backgroundColor: color.hex }}
                          >
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                              {copiedIndex === idx ? <Check className="w-5 h-5 md:w-6 md:h-6 text-white mix-blend-difference" /> : <Copy className="w-5 h-5 md:w-6 md:h-6 text-white mix-blend-difference" />}
                            </div>
                          </div>
                          
                          {/* Text Area (Expands reasoning on Mobile Click or Desktop Hover) */}
                          <div 
                            className="mt-3 md:mt-4 text-center px-1 w-full md:cursor-default cursor-pointer"
                            onClick={() => setExpandedSwatch(expandedSwatch === idx ? null : idx)}
                          >
                            <p className="text-xs md:text-sm font-black tracking-tight text-text-main uppercase">{color.hex}</p>
                            <p className="text-[9px] md:text-[10px] font-bold text-brand-primary uppercase tracking-widest mt-1">{color.role}</p>
                            
                            <p className={`
                              text-[8px] md:text-[9px] text-text-muted leading-tight mt-2 max-w-[120px] mx-auto transition-all
                              ${expandedSwatch === idx ? 'line-clamp-none' : 'line-clamp-2 md:line-clamp-3 md:group-hover:line-clamp-none'}
                            `}>
                              {color.reasoning}
                            </p>

                            {/* Mobile visual cue to tap */}
                            <p className="text-[7px] text-brand-primary/60 uppercase tracking-widest mt-2 md:hidden">
                              {expandedSwatch === idx ? 'Tap to close' : 'Tap to read'}
                            </p>
                          </div>
                        </motion.div>
                      ))}
                    </div>

                    <div className="mt-12 md:mt-16 p-6 bg-white rounded-2xl border border-gray-100 shadow-sm">
                      <h4 className="text-xs font-bold text-text-muted uppercase tracking-widest mb-3">AI Insights</h4>
                      <p className="text-xs md:text-sm text-text-main leading-relaxed">{result.overall_style}</p>
                      <div className="mt-4 pt-4 border-t border-gray-50 flex items-start gap-2 text-amber-600">
                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                        <p className="text-[10px] md:text-xs font-medium">{result.colorblind_notes}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </section>

        {/* Features Section */}
        <section id="features" className="max-w-7xl mx-auto px-6 mb-32">
          <div className="text-center mb-20">
            <span className="text-brand-primary font-bold text-sm uppercase tracking-widest">Our Features</span>
            <h2 className="text-4xl md:text-5xl font-extrabold mt-4 mb-6">Designed for Data Professionals</h2>
            <p className="text-text-muted max-w-2xl mx-auto">PaletteIQ bridges the gap between data visualization and professional design. Get the colors you need, exactly where you need them.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {[
              { icon: <Zap />, title: 'Semantic Extraction', desc: 'Our AI identifies Background, Primary Data, and Accent roles automatically, ensuring your palette is ready for any BI tool.' },
              { icon: <Shield />, title: 'Accessibility First', desc: 'Every palette is analyzed for colorblind accessibility, with specific notes to ensure your dashboards are inclusive.' },
              { icon: <BarChart3 />, title: 'Tool-Ready Exports', desc: 'Export directly to Power BI (JSON), Figma (Tokens), or copy Hex lists for Excel, Tableau, and Canva.' },
              { icon: <MousePointer2 />, title: 'High-Fidelity Analysis', desc: 'We upscale your visualizations before analysis to ensure maximum hex accuracy and detail extraction.' }
            ].map((feature, i) => (
              <div key={i} className="p-10 bg-white rounded-3xl border border-gray-100 shadow-sm hover:shadow-xl hover:shadow-indigo-500/5 transition-all group">
                <div className="w-12 h-12 bg-brand-primary/5 rounded-xl flex items-center justify-center text-brand-primary mb-6 group-hover:scale-110 transition-transform">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-bold mb-4">{feature.title}</h3>
                <p className="text-text-muted leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Testimonials */}
        <section className="bg-brand-primary/5 py-32 mb-32">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-20">
              <h2 className="text-4xl md:text-5xl font-extrabold mb-4">Loved by Analysts</h2>
              <p className="text-text-muted">See how PaletteIQ is changing the workflow for data professionals.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                { name: 'Sarah Chen', role: 'Senior Data Analyst', text: 'PaletteIQ saved me hours of manual hex-copying. The semantic role extraction is surprisingly accurate, especially for complex Power BI dashboards.' },
                { name: 'Marcus Thorne', role: 'BI Developer', text: 'The ability to export directly to a Power BI theme JSON is a game changer. It ensures brand consistency across all our internal reports with zero effort.' },
                { name: 'Elena Rodriguez', role: 'UX Designer', text: 'I use PaletteIQ to audit our dashboards for accessibility. The colorblind simulation and AI notes help us catch issues before they reach the client.' }
              ].map((t, i) => (
                <div key={i} className="p-8 bg-white rounded-3xl shadow-sm border border-gray-100">
                  <p className="text-text-muted mb-8 italic">"{t.text}"</p>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gray-200 rounded-full" />
                    <div>
                      <p className="font-bold text-sm">{t.name}</p>
                      <p className="text-xs text-text-muted">{t.role}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="max-w-7xl mx-auto px-6 mb-32">
          <div className="text-center mb-20">
            <span className="text-brand-primary font-bold text-sm uppercase tracking-widest">Pricing</span>
            <h2 className="text-4xl md:text-5xl font-extrabold mt-4 mb-6">Free for Everyone</h2>
            <p className="text-text-muted">PaletteIQ is currently in public beta and free to use for all data professionals.</p>
          </div>

          <div className="max-w-md mx-auto">
            <div className="p-10 rounded-3xl border bg-brand-primary/5 border-brand-primary shadow-xl shadow-brand-primary/10">
              <h3 className="text-xl font-bold mb-2">Beta Access</h3>
              <p className="text-text-muted text-sm mb-8">Full access to all AI extraction and export features.</p>
              <div className="text-4xl font-black mb-8">$0<span className="text-sm font-normal text-text-muted">/forever</span></div>
              <ul className="space-y-4 mb-10">
                {[
                  'Unlimited Palette Extractions',
                  'Power BI & Figma Exports',
                  'Accessibility Analysis',
                  'High-Res Image Upscaling',
                  'Semantic Role Identification'
                ].map((f, j) => (
                  <li key={j} className="flex items-center gap-3 text-sm text-text-muted">
                    <Check className="w-4 h-4 text-brand-primary" /> {f}
                  </li>
                ))}
              </ul>
              <button className="w-full py-4 rounded-xl font-bold bg-brand-primary text-white shadow-lg shadow-brand-primary/20 transition-all">
                Get Started Now
              </button>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section id="faq" className="max-w-4xl mx-auto px-6 mb-32">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-extrabold mb-4">Frequently Asked Questions</h2>
          </div>
          <div className="space-y-4">
            {[
              { q: 'What is PaletteIQ?', a: 'PaletteIQ is an AI-powered color intelligence tool that extracts professional palettes from any data visualization, including dashboards, infographics, and charts.' },
              { q: 'How do I apply the palette to my tools?', a: 'You can export your palette as a Power BI JSON theme, Figma Tokens, or a professional PNG for tools like Excel, Tableau, and Canva.' },
              { q: 'Is this tool free to use?', a: 'Yes! PaletteIQ is currently in public beta and is free for all data professionals and analysts.' },
              { q: 'Can I use it for infographics?', a: 'Absolutely. PaletteIQ works across all types of visual data designs, identifying semantic roles for every color it finds.' }
            ].map((faq, i) => (
              <details key={i} className="group bg-white border border-gray-100 rounded-2xl p-6 cursor-pointer hover:border-brand-primary transition-all">
                <summary className="flex items-center justify-between font-bold text-text-main list-none">
                  {faq.q}
                  <ChevronRight className="w-5 h-5 text-gray-400 group-open:rotate-90 transition-transform" />
                </summary>
                <p className="mt-4 text-text-muted text-sm leading-relaxed">{faq.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* CTA Section */}
        <section className="max-w-7xl mx-auto px-4 md:px-6 mb-32">
          <div className="bg-brand-primary/5 rounded-[2rem] md:rounded-[3rem] p-10 md:p-20 text-center relative overflow-hidden">
            <div className="relative z-10">
              <h2 className="text-3xl md:text-6xl font-extrabold mt-6 mb-6 md:mb-10 leading-tight">Ready to create your <br className="hidden md:block" /> next professional palette?</h2>
              <p className="text-text-muted mb-10 text-sm md:text-base">Start designing professional color schemes in minutes.</p>
              <div className="flex flex-col sm:flex-row justify-center gap-4">
                <button onClick={() => document.getElementById('tool-dashboard')?.scrollIntoView({ behavior: 'smooth' })} className="px-10 py-4 md:py-5 bg-brand-primary text-white font-bold rounded-full shadow-xl shadow-brand-primary/30 hover:bg-brand-secondary transition-all active:scale-95">
                  Get Started Now
                </button>
                <button 
                  onClick={() => document.getElementById('how-to-use')?.scrollIntoView({ behavior: 'smooth' })}
                  className="px-10 py-4 md:py-5 bg-white text-text-main font-bold rounded-full border border-gray-200 hover:bg-gray-50 transition-all active:scale-95"
                >
                  How to Use
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Modals */}
      {showTerms && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm">
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-3xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-8 md:p-12 relative">
            <button onClick={() => setShowTerms(false)} className="absolute top-6 right-6 p-2 hover:bg-gray-100 rounded-full transition-colors">
              <X className="w-6 h-6" />
            </button>
            <h2 className="text-3xl font-black mb-6">Terms & Conditions</h2>
            <div className="space-y-4 text-text-muted text-sm leading-relaxed">
              <p>Welcome to PaletteIQ. By using our service, you agree to the following terms:</p>
              <h3 className="font-bold text-text-main">1. Use of Service</h3>
              <p>PaletteIQ is provided for professional color extraction and analysis. You are responsible for the images you upload and must ensure you have the rights to use them.</p>
              <h3 className="font-bold text-text-main">2. AI Analysis</h3>
              <p>Our analysis is powered by AI. While we strive for accuracy, we do not guarantee that the extracted palettes or semantic roles are 100% accurate or suitable for all production environments.</p>
              <h3 className="font-bold text-text-main">3. Intellectual Property</h3>
              <p>The palettes generated are yours to use. However, the PaletteIQ brand, code, and design remain the property of PaletteIQ Studio.</p>
              <h3 className="font-bold text-text-main">4. Limitation of Liability</h3>
              <p>PaletteIQ is provided "as is" without warranties of any kind. We are not liable for any damages resulting from the use of our tool.</p>
            </div>
          </motion.div>
        </div>
      )}

      {showPrivacy && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm">
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-3xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-8 md:p-12 relative">
            <button onClick={() => setShowPrivacy(false)} className="absolute top-6 right-6 p-2 hover:bg-gray-100 rounded-full transition-colors">
              <X className="w-6 h-6" />
            </button>
            <h2 className="text-3xl font-black mb-6">Privacy Policy</h2>
            <div className="space-y-4 text-text-muted text-sm leading-relaxed">
              <p>Your privacy is important to us. Here is how we handle your data:</p>
              <h3 className="font-bold text-text-main">1. Image Data</h3>
              <p>Uploaded images are processed in your browser and sent to Gemini AI for analysis. We do not store your images on our servers.</p>
              <h3 className="font-bold text-text-main">2. Cookies</h3>
              <p>We use minimal cookies to ensure the application functions correctly and to analyze basic usage patterns.</p>
              <h3 className="font-bold text-text-main">3. Third-Party Services</h3>
              <p>We use Google Gemini AI for color analysis. Their use of data is governed by their own privacy policies.</p>
              <h3 className="font-bold text-text-main">4. Contact</h3>
              <p>For any privacy-related concerns, please reach out to us via our social channels.</p>
            </div>
          </motion.div>
        </div>
      )}

      <footer className="bg-white border-t border-gray-100 py-12">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8 mb-12">
            <div className="flex items-center gap-2">
              <Palette className="text-brand-primary w-6 h-6" />
              <span className="text-xl font-bold tracking-tight">PaletteIQ</span>
            </div>
            
            <div className="flex flex-wrap justify-center gap-8 text-sm font-medium text-text-muted">
              <button onClick={() => document.getElementById('how-to-use')?.scrollIntoView({ behavior: 'smooth' })} className="hover:text-brand-primary transition-colors">How to Use</button>
              <button onClick={() => setShowTerms(true)} className="hover:text-brand-primary transition-colors">Terms & Conditions</button>
              <button onClick={() => setShowPrivacy(true)} className="hover:text-brand-primary transition-colors">Privacy Policy</button>
            </div>
          </div>

          <div className="flex flex-col md:flex-row justify-between items-center gap-6 pt-8 border-t border-gray-50">
            <p className="text-sm text-text-muted text-center md:text-left">
              © 2026 PaletteIQ Studio. Designed with love by <a href="https://linktr.ee/AnalystFemi" target="_blank" rel="noopener noreferrer" className="text-brand-primary font-bold hover:underline">AnalystFemi</a>.
            </p>
            
            <div className="flex gap-6">
              <a href="https://tiktok.com/@AnalystFemi" target="_blank" rel="noopener noreferrer" className="text-text-muted hover:text-brand-primary transition-colors">
                <span className="sr-only">TikTok</span>
                <Music2 className="w-5 h-5" />
              </a>
              <a href="https://twitter.com/AnalystFemi" target="_blank" rel="noopener noreferrer" className="text-text-muted hover:text-brand-primary transition-colors">
                <span className="sr-only">Twitter</span>
                <Twitter className="w-5 h-5" />
              </a>
              <a href="https://facebook.com/AnalystFemi" target="_blank" rel="noopener noreferrer" className="text-text-muted hover:text-brand-primary transition-colors">
                <span className="sr-only">Facebook</span>
                <Facebook className="w-5 h-5" />
              </a>
              <a href="https://instagram.com/AnalystFemi" target="_blank" rel="noopener noreferrer" className="text-text-muted hover:text-brand-primary transition-colors">
                <span className="sr-only">Instagram</span>
                <Instagram className="w-5 h-5" />
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}