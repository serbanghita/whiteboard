import { IRenderer, TextureHandle } from "./renderer";
import { layoutText, TextBox } from "./textLayout";

// Raster scale clamps, as multiples of devicePixelRatio. The camera clamp is
// 0.1-8 and zoom buckets are powers of two, so [0.125, 8] already spans the
// whole range - the clamp only defends pathological DPR/box combinations.
export const MIN_RASTER_SCALE_FACTOR = 0.125;
export const MAX_RASTER_SCALE_FACTOR = 8;

/**
 * Power-of-two zoom bucket for the camera scale. Pinch-zoom does not
 * re-rasterize per wheel tick, and text is never more than ~sqrt(2) away
 * from its ideal resolution between buckets.
 */
export function zoomBucket(scale: number): number {
  return Math.pow(2, Math.round(Math.log2(scale)));
}

export interface TextStyle {
  content: string;
  fontSize: number;
  fontFamily: string;
  color: string;
}

interface CacheEntry {
  texture: TextureHandle;
  key: string;
}

/**
 * Rasterizes a text block into an offscreen 2D canvas at the given scale.
 * Returns null when the canvas would be degenerate (<1px) or when no 2D
 * context is available (e.g. jsdom) - callers simply skip the text.
 */
function rasterize(style: TextStyle, box: TextBox, rasterScale: number): HTMLCanvasElement | null {
  const width = Math.ceil(box.width * rasterScale);
  const height = Math.ceil(box.height * rasterScale);
  if (width < 1 || height < 1) {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  const layout = layoutText(style.content, box, style.fontSize, style.fontFamily);

  // No centering here - placement comes entirely from the layout's box-local
  // line positions (textLayout is the single owner of placement).
  context.font = `${style.fontSize * rasterScale}px ${style.fontFamily}`;
  context.textAlign = "left";
  context.textBaseline = "top";
  context.fillStyle = style.color;
  for (const line of layout.lines) {
    context.fillText(line.text, line.x * rasterScale, line.y * rasterScale);
  }

  return canvas;
}

/**
 * Per-entity cache of rasterized text textures, owned by RenderSystem (the
 * renderer itself stays immediate-mode). Textures are re-created when the
 * content, box size, style or zoom bucket changes, and freed on sweep().
 */
export default class TextTextureCache {
  private entries: Map<string, CacheEntry> = new Map();

  constructor(private renderer: IRenderer) {}

  private static key(style: TextStyle, box: TextBox, bucket: number): string {
    return [style.content, box.width, box.height, style.fontSize, style.fontFamily, style.color, bucket].join("|");
  }

  /**
   * Returns the texture for an entity's text block, rasterizing on miss.
   *
   * @param freezeSize While true (the entity is being handle-resized), a
   * cached texture is reused even if stale and stretched by the caller's
   * quad - re-rasterizing on release avoids a raster + GPU upload per frame
   * of the drag.
   */
  public get(entityId: string, style: TextStyle, box: TextBox, cameraScale: number, freezeSize: boolean): TextureHandle | null {
    const existing = this.entries.get(entityId);
    if (existing && freezeSize) {
      return existing.texture;
    }

    const devicePixelRatio = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
    const bucket = zoomBucket(cameraScale);
    let rasterScale = Math.min(
      Math.max(bucket * devicePixelRatio, MIN_RASTER_SCALE_FACTOR * devicePixelRatio),
      MAX_RASTER_SCALE_FACTOR * devicePixelRatio,
    );
    // Never exceed the backend's texture size limit.
    const maxSize = this.renderer.maxTextureSize();
    const largestSide = Math.max(box.width, box.height);
    if (largestSide * rasterScale > maxSize) {
      rasterScale = maxSize / largestSide;
    }

    const key = TextTextureCache.key(style, box, bucket);
    if (existing && existing.key === key) {
      return existing.texture;
    }

    const raster = rasterize(style, box, rasterScale);
    if (existing) {
      this.renderer.deleteTexture(existing.texture);
      this.entries.delete(entityId);
    }
    if (!raster) {
      return null;
    }

    const texture = this.renderer.createTextureFromCanvas(raster);
    this.entries.set(entityId, { texture, key });
    return texture;
  }

  /**
   * Frees textures for entities not in the live set (removed entities,
   * cleared text, the entity currently being edited). Called once per frame;
   * iterates the cache, not the world.
   */
  public sweep(liveEntityIds: Set<string>): void {
    this.entries.forEach((entry, entityId) => {
      if (!liveEntityIds.has(entityId)) {
        this.renderer.deleteTexture(entry.texture);
        this.entries.delete(entityId);
      }
    });
  }

  /** Frees everything (whiteboard teardown). */
  public dispose(): void {
    this.entries.forEach((entry) => this.renderer.deleteTexture(entry.texture));
    this.entries.clear();
  }
}
