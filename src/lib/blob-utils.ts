/**
 * Blob Path Generator Utilities
 * Creates organic, morphing SVG blob shapes for the Living Pipeline visualization
 */

export interface BlobPoint {
  x: number;
  y: number;
  originX: number;
  originY: number;
  noiseOffsetX: number;
  noiseOffsetY: number;
}

/**
 * Simple noise function for organic movement
 */
function noise(x: number, y: number, t: number): number {
  return Math.sin(x * 0.5 + t) * Math.cos(y * 0.5 + t * 0.7) * 0.5 + 0.5;
}

/**
 * Generate points around an ellipse for blob base shape
 */
export function generateBlobPoints(
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
  numPoints: number = 8
): BlobPoint[] {
  const points: BlobPoint[] = [];
  const angleStep = (Math.PI * 2) / numPoints;

  for (let i = 0; i < numPoints; i++) {
    const angle = i * angleStep;
    const x = centerX + Math.cos(angle) * radiusX;
    const y = centerY + Math.sin(angle) * radiusY;

    points.push({
      x,
      y,
      originX: x,
      originY: y,
      noiseOffsetX: Math.random() * 1000,
      noiseOffsetY: Math.random() * 1000,
    });
  }

  return points;
}

/**
 * Update blob points with organic noise-based movement
 */
export function updateBlobPoints(
  points: BlobPoint[],
  time: number,
  amplitude: number = 15,
  speed: number = 1
): BlobPoint[] {
  return points.map((point) => {
    const noiseX = noise(point.noiseOffsetX, 0, time * speed);
    const noiseY = noise(0, point.noiseOffsetY, time * speed);

    return {
      ...point,
      x: point.originX + (noiseX - 0.5) * amplitude * 2,
      y: point.originY + (noiseY - 0.5) * amplitude * 2,
    };
  });
}

/**
 * Convert points to a smooth SVG path using cubic bezier curves
 */
export function pointsToSmoothPath(points: BlobPoint[]): string {
  if (points.length < 3) return "";

  const smoothing = 0.2;

  // Helper to get control points for smooth curves
  const getControlPoints = (p0: BlobPoint, p1: BlobPoint, p2: BlobPoint) => {
    const d01 = Math.sqrt(Math.pow(p1.x - p0.x, 2) + Math.pow(p1.y - p0.y, 2));
    const d12 = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));

    const fa = (smoothing * d01) / (d01 + d12);
    const fb = smoothing - fa;

    const cp1x = p1.x - fa * (p2.x - p0.x);
    const cp1y = p1.y - fa * (p2.y - p0.y);
    const cp2x = p1.x + fb * (p2.x - p0.x);
    const cp2y = p1.y + fb * (p2.y - p0.y);

    return { cp1x, cp1y, cp2x, cp2y };
  };

  let path = `M ${points[0].x} ${points[0].y}`;

  for (let i = 0; i < points.length; i++) {
    const p0 = points[(i - 1 + points.length) % points.length];
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    const p3 = points[(i + 2) % points.length];

    const cp1 = getControlPoints(p0, p1, p2);
    const cp2 = getControlPoints(p1, p2, p3);

    path += ` C ${cp1.cp2x} ${cp1.cp2y}, ${cp2.cp1x} ${cp2.cp1y}, ${p2.x} ${p2.y}`;
  }

  path += " Z";
  return path;
}

/**
 * Generate multiple blob path variations for morphing
 */
export function generateBlobVariations(
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
  numVariations: number = 4,
  numPoints: number = 8
): string[] {
  const variations: string[] = [];
  const basePoints = generateBlobPoints(centerX, centerY, radiusX, radiusY, numPoints);

  for (let v = 0; v < numVariations; v++) {
    const variationPoints = basePoints.map((point) => {
      // Add random organic variation to each point
      const angleVariation = (Math.random() - 0.5) * 0.3;
      const radiusVariation = 0.85 + Math.random() * 0.3;

      const angle = Math.atan2(point.originY - centerY, point.originX - centerX);
      const radius = Math.sqrt(
        Math.pow(point.originX - centerX, 2) + Math.pow(point.originY - centerY, 2)
      );

      const newAngle = angle + angleVariation;
      const newRadius = radius * radiusVariation;

      return {
        ...point,
        x: centerX + Math.cos(newAngle) * newRadius,
        y: centerY + Math.sin(newAngle) * newRadius,
        originX: centerX + Math.cos(newAngle) * newRadius,
        originY: centerY + Math.sin(newAngle) * newRadius,
      };
    });

    variations.push(pointsToSmoothPath(variationPoints));
  }

  return variations;
}

/**
 * Create an SVG filter for the glow effect
 */
export function getGlowFilterId(color: string): string {
  return `glow-${color.replace(/[^a-zA-Z0-9]/g, "")}`;
}

/**
 * Generate CSS gradient for blob fill based on state
 */
export function getBlobGradient(state: "incoming" | "active" | "finished"): {
  start: string;
  end: string;
  glow: string;
} {
  switch (state) {
    case "incoming":
      return {
        start: "rgba(41, 182, 246, 0.3)", // Cyan - info color
        end: "rgba(41, 182, 246, 0.1)",
        glow: "rgba(41, 182, 246, 0.6)",
      };
    case "active":
      return {
        start: "rgba(76, 126, 255, 0.4)", // Indigo - primary
        end: "rgba(107, 147, 255, 0.15)",
        glow: "rgba(76, 126, 255, 0.8)",
      };
    case "finished":
      return {
        start: "rgba(0, 200, 83, 0.3)", // Green - success
        end: "rgba(0, 200, 83, 0.1)",
        glow: "rgba(0, 200, 83, 0.6)",
      };
  }
}
