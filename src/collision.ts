/**
 * Standalone collision detection functions for the whiteboard.
 * These replace the geometry class methods for simpler, dependency-free collision checks.
 */

/**
 * Check if a point is inside a rectangle.
 * @param px - Point x coordinate
 * @param py - Point y coordinate
 * @param rx - Rectangle top-left x coordinate
 * @param ry - Rectangle top-left y coordinate
 * @param rw - Rectangle width
 * @param rh - Rectangle height
 * @returns true if the point is inside the rectangle
 */
export function pointInRectangle(
  px: number,
  py: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number
): boolean {
  return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
}

/**
 * Check if a point is inside a circle.
 * @param px - Point x coordinate
 * @param py - Point y coordinate
 * @param cx - Circle center x coordinate
 * @param cy - Circle center y coordinate
 * @param radius - Circle radius
 * @returns true if the point is inside the circle
 */
export function pointInCircle(
  px: number,
  py: number,
  cx: number,
  cy: number,
  radius: number
): boolean {
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= radius * radius;
}

/**
 * Check if a point is on or near a line segment.
 * Uses distance from point to line segment calculation.
 * @param px - Point x coordinate
 * @param py - Point y coordinate
 * @param x1 - Line start x coordinate
 * @param y1 - Line start y coordinate
 * @param x2 - Line end x coordinate
 * @param y2 - Line end y coordinate
 * @param tolerance - Distance threshold for considering a point "on" the line
 * @returns true if the point is within tolerance distance of the line segment
 */
export function pointOnLine(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  tolerance: number = 5
): boolean {
  const lineLengthSquared = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);

  // If line is a point, check distance to that point
  if (lineLengthSquared === 0) {
    const dx = px - x1;
    const dy = py - y1;
    return Math.sqrt(dx * dx + dy * dy) <= tolerance;
  }

  // Calculate projection of point onto line segment
  // t is the parameter for the closest point on the line
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / lineLengthSquared;

  // Clamp t to [0, 1] to stay within segment
  t = Math.max(0, Math.min(1, t));

  // Find the closest point on the segment
  const closestX = x1 + t * (x2 - x1);
  const closestY = y1 + t * (y2 - y1);

  // Calculate distance from point to closest point on segment
  const dx = px - closestX;
  const dy = py - closestY;
  const distance = Math.sqrt(dx * dx + dy * dy);

  return distance <= tolerance;
}
