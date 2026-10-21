"use client";

import React, { useRef, useState, useEffect } from "react";
import { getStroke } from "perfect-freehand";
import * as Y from "yjs";
import { useRoomStore } from "../store/roomStore";

export interface FreehandStroke {
  id: string;
  points: number[][];
  color: string;
  user: string;
}

interface DrawingCanvasProps {
  isDrawingMode: boolean;
  ydoc?: Y.Doc | null;
}

// Convert stroke polygon points into smooth SVG path data
function getSvgPathFromStroke(stroke: number[][]): string {
  if (!stroke.length) return "";
  const d = stroke.reduce(
    (acc: (string | number)[], [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      return acc;
    },
    ["M", ...stroke[0], "Q"]
  );
  d.push("Z");
  return d.join(" ");
}

export function DrawingCanvas({ isDrawingMode, ydoc }: DrawingCanvasProps) {
  const { currentUser } = useRoomStore();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [currentPoints, setCurrentPoints] = useState<number[][]>([]);
  const [strokes, setStrokes] = useState<FreehandStroke[]>([]);
  const isPointerDownRef = useRef(false);

  // Synchronize strokes with Yjs shared array
  useEffect(() => {
    if (!ydoc) return;

    const yStrokes = ydoc.getArray<FreehandStroke>("freehand_strokes");
    setStrokes(yStrokes.toArray());

    const observer = () => {
      setStrokes(yStrokes.toArray());
    };

    yStrokes.observe(observer);
    return () => {
      yStrokes.unobserve(observer);
    };
  }, [ydoc]);

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDrawingMode || !svgRef.current) return;
    isPointerDownRef.current = true;
    (e.target as Element).setPointerCapture(e.pointerId);

    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const pressure = e.pressure || 0.5;

    setCurrentPoints([[x, y, pressure]]);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isPointerDownRef.current || !isDrawingMode || !svgRef.current) return;

    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const pressure = e.pressure || 0.5;

    setCurrentPoints((prev) => [...prev, [x, y, pressure]]);
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isPointerDownRef.current) return;
    isPointerDownRef.current = false;

    if (currentPoints.length > 1) {
      const newStroke: FreehandStroke = {
        id: `stroke_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        points: currentPoints,
        color: currentUser?.color || "#10b981",
        user: currentUser?.name || "Dev A",
      };

      if (ydoc) {
        const yStrokes = ydoc.getArray<FreehandStroke>("freehand_strokes");
        yStrokes.push([newStroke]);
      } else {
        setStrokes((prev) => [...prev, newStroke]);
      }
    }

    setCurrentPoints([]);
  };

  // Generate outline for current active stroke
  const currentOutline = currentPoints.length
    ? getStroke(currentPoints, {
        size: 5,
        thinning: 0.5,
        smoothing: 0.5,
        streamline: 0.5,
      })
    : [];

  return (
    <svg
      ref={svgRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className={`absolute inset-0 w-full h-full z-10 ${
        isDrawingMode
          ? "pointer-events-auto cursor-crosshair touch-none"
          : "pointer-events-none"
      }`}
      style={{ touchAction: "none" }}
    >
      {/* Existing Synchronized Strokes */}
      {strokes.map((stroke) => {
        const outline = getStroke(stroke.points, {
          size: 5,
          thinning: 0.5,
          smoothing: 0.5,
          streamline: 0.5,
        });
        const pathData = getSvgPathFromStroke(outline);
        return (
          <path
            key={stroke.id}
            d={pathData}
            fill={stroke.color}
            opacity={0.88}
          />
        );
      })}

      {/* In-Flight Current Stroke */}
      {currentOutline.length > 0 && (
        <path
          d={getSvgPathFromStroke(currentOutline)}
          fill={currentUser?.color || "#10b981"}
          opacity={0.9}
        />
      )}
    </svg>
  );
}
