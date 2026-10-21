"use client";

import React, { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";
import { Loader2, AlertCircle, ZoomIn, ZoomOut, RotateCcw, Copy, Check } from "lucide-react";

interface MermaidDiagramProps {
  mermaidSrc: string;
  title?: string;
}

export function MermaidDiagram({ mermaidSrc, title }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgContent, setSvgContent] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [zoom, setZoom] = useState<number>(1);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: "dark",
      securityLevel: "loose",
      fontFamily: "var(--font-geist-sans), monospace",
      themeVariables: {
        darkMode: true,
        background: "#090d16",
        mainBkg: "#0f172a",
        primaryColor: "#0284c7",
        primaryTextColor: "#f8fafc",
        primaryBorderColor: "#38bdf8",
        lineColor: "#64748b",
        secondaryColor: "#064e3b",
        tertiaryColor: "#1e1b4b",
      },
    });
  }, []);

  useEffect(() => {
    if (!mermaidSrc) {
      setSvgContent("");
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    const renderChart = async () => {
      try {
        const uniqueId = `mermaid_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const { svg } = await mermaid.render(uniqueId, mermaidSrc);
        if (isMounted) {
          setSvgContent(svg);
          setIsLoading(false);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || "Failed to render Mermaid diagram.");
          setIsLoading(false);
        }
      }
    };

    renderChart();

    return () => {
      isMounted = false;
    };
  }, [mermaidSrc]);

  const handleCopySource = () => {
    navigator.clipboard.writeText(mermaidSrc);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full w-full bg-slate-950 border border-slate-800 rounded-lg overflow-hidden select-none">
      {/* Diagram Toolbar */}
      <div className="h-9 px-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
        <span className="font-semibold text-slate-200 truncate">
          {title || "Architectural Call Graph"}
        </span>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoom((z) => Math.min(2.0, z + 0.15))}
            className="p-1 hover:text-slate-100 hover:bg-slate-800 rounded transition"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.15))}
            className="p-1 hover:text-slate-100 hover:bg-slate-800 rounded transition"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setZoom(1)}
            className="p-1 hover:text-slate-100 hover:bg-slate-800 rounded transition"
            title="Reset Zoom"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <div className="h-3 w-px bg-slate-800 mx-1" />
          <button
            onClick={handleCopySource}
            className="flex items-center gap-1 px-2 py-0.5 text-[11px] hover:text-slate-200 hover:bg-slate-800 rounded transition"
            title="Copy Mermaid source"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>Source</span>
          </button>
        </div>
      </div>

      {/* Diagram Render Area */}
      <div className="flex-1 overflow-auto p-4 flex items-center justify-center relative min-h-[180px]">
        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
            <span>Rendering diagram...</span>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center gap-2 p-4 text-xs text-rose-400 max-w-md text-center">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        )}

        {!isLoading && !error && svgContent && (
          <div
            ref={containerRef}
            className="transition-transform duration-150 origin-center flex items-center justify-center"
            style={{ transform: `scale(${zoom})` }}
            dangerouslySetInnerHTML={{ __html: svgContent }}
          />
        )}
      </div>
    </div>
  );
}
