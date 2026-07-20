import { Entity, Query, System, World } from "@serbanghita-gamedev/ecs";
import MouseComponent from "../component/MouseComponent";
import ToolStateComponent from "../component/ToolStateComponent";
import TextComponent from "../component/TextComponent";
import CameraComponent from "../component/CameraComponent";
import { hitTestEntity } from "../shape";
import { getCameraScale, worldToScreen } from "../camera";
import {
  getInteriorBox,
  LINE_HEIGHT_FACTOR,
  DEFAULT_FONT_SIZE,
  DEFAULT_FONT_FAMILY,
  DEFAULT_TEXT_COLOR,
} from "../textLayout";

// Above the canvas, below the floating menu (menu is 1000).
const OVERLAY_Z_INDEX = "500";

/**
 * Double-click a rect/circle (cursor tool) to edit its text in a transparent
 * DOM textarea positioned over the shape's interior. Commit on blur or
 * Escape (Escape commits, not cancels - matches the blur model, no surprise
 * text loss). Enter inserts a newline.
 *
 * The query is the connectable-shapes query (rect + circle, no lines) -
 * exactly the text-capable set.
 *
 * Click-away suppression: a canvas mousedown blurs the textarea AFTER the
 * press was recorded (browsers fire mousedown before blur), so commit stamps
 * ToolStateComponent.suppressedPressCount with that pressCount; every press
 * consumer skips the suppressed press for its entire hold.
 */
export default class TextEditSystem extends System {
  private lastDblClickCount = 0;
  private textarea: HTMLTextAreaElement | null = null;
  private editingEntityId: string | null = null;
  // Content at edit entry; a commit only records history when it changed.
  private initialContent = '';
  private committing = false;

  public constructor(
    public world: World,
    public query: Query,
    private wrapper: HTMLElement,
    // Whiteboard.recordHistory, same wiring as HistorySystem. Called on every
    // commit that changed the content: Escape commits produce no mouse
    // release, so HistorySystem's release-edge snapshot never sees them.
    // (HistoryManager.pushState dedups identical states, but the changed
    // check also avoids serializing the whole board on no-op commits.)
    private onContentChanged: () => void,
  ) {
    super(world, query);
  }

  public update(now: number): void {
    const cursor = this.world.getEntity('cursor') as Entity;
    const mouseComp = cursor.getComponent(MouseComponent);

    // Consume the double-click edge every frame, even when gated below.
    const dblClickEdge = mouseComp.dblClickCount > this.lastDblClickCount;
    this.lastDblClickCount = mouseComp.dblClickCount;
    if (!dblClickEdge) {
      return;
    }

    const toolEntity = this.world.getEntity('tool');
    if (!toolEntity) {
      return;
    }
    const toolState = toolEntity.getComponent(ToolStateComponent);

    // Text editing only exists in cursor mode, one edit at a time.
    if (toolState.currentTool !== 'cursor' || toolState.editingEntityId) {
      return;
    }

    // Topmost text-capable shape under the double-click (event-time coords).
    const scale = getCameraScale(this.world);
    const entities = [...this.query.execute().values()];
    for (let i = entities.length - 1; i >= 0; i--) {
      if (hitTestEntity(entities[i], mouseComp.dblClickX, mouseComp.dblClickY, scale)) {
        this.enterEdit(entities[i], toolState);
        return;
      }
    }
  }

  private enterEdit(entity: Entity, toolState: ToolStateComponent): void {
    const box = getInteriorBox(entity);
    if (!box) {
      // Shape too small to hold any text.
      return;
    }

    const cameraEntity = this.world.getEntity('camera');
    if (!cameraEntity) {
      return;
    }
    const camera = cameraEntity.getComponent(CameraComponent);

    const existing = entity.hasComponent(TextComponent) ? entity.getComponent(TextComponent) : null;
    const fontSize = existing?.fontSize ?? DEFAULT_FONT_SIZE;
    const fontFamily = existing?.fontFamily ?? DEFAULT_FONT_FAMILY;
    const color = existing?.color ?? DEFAULT_TEXT_COLOR;

    // Overlay geometry is computed once at entry; camera moves and container
    // resizes commit the edit instead of repositioning (v1 simplification,
    // handled by Whiteboard's wheel/resize hooks).
    const topLeft = worldToScreen(camera, box.x, box.y);
    const textarea = document.createElement('textarea');
    textarea.value = existing?.content ?? '';
    const style = textarea.style;
    style.position = 'absolute';
    style.left = `${topLeft.x}px`;
    style.top = `${topLeft.y}px`;
    style.width = `${box.width * camera.scale}px`;
    style.height = `${box.height * camera.scale}px`;
    style.zIndex = OVERLAY_Z_INDEX;
    style.background = 'transparent';
    style.border = 'none';
    style.outline = 'none';
    style.resize = 'none';
    style.overflow = 'hidden';
    style.padding = '0';
    style.margin = '0';
    style.textAlign = 'center';
    style.fontSize = `${fontSize * camera.scale}px`;
    style.fontFamily = fontFamily;
    style.lineHeight = String(LINE_HEIGHT_FACTOR);
    style.color = color;

    // Belt for the document-level keydown handlers (Escape draw-cancel,
    // Ctrl/Cmd+Z history): keystrokes inside the editor never leave it.
    textarea.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        this.commit();
      }
    });
    textarea.addEventListener('blur', () => this.commit());

    this.wrapper.appendChild(textarea);
    this.textarea = textarea;
    this.editingEntityId = entity.id;
    this.initialContent = existing?.content ?? '';
    toolState.editingEntityId = entity.id;

    textarea.focus();
    textarea.select();
  }

  /**
   * Writes the textarea content into the entity's TextComponent (adding or
   * removing the component as needed), tears the overlay down and stamps the
   * click-away press suppression. Idempotent: removing the textarea fires a
   * final blur that must be a no-op.
   */
  private commit(): void {
    if (this.committing || !this.textarea || !this.editingEntityId) {
      return;
    }
    this.committing = true;

    const entity = this.world.getEntity(this.editingEntityId);
    const content = this.textarea.value;
    // Empty commits store nothing - the effective content is ''.
    const effectiveContent = content.trim() === '' ? '' : content;
    if (entity) {
      if (effectiveContent === '') {
        entity.removeComponent(TextComponent);
      } else if (entity.hasComponent(TextComponent)) {
        entity.getComponent(TextComponent).content = content;
      } else {
        entity.addComponent(TextComponent, {
          content,
          fontSize: DEFAULT_FONT_SIZE,
          fontFamily: DEFAULT_FONT_FAMILY,
          color: DEFAULT_TEXT_COLOR,
        });
      }
    }

    const toolEntity = this.world.getEntity('tool');
    if (toolEntity) {
      const toolState = toolEntity.getComponent(ToolStateComponent);
      toolState.editingEntityId = null;
      // The mousedown that caused a click-away blur is already recorded
      // (mousedown fires before blur) - suppress that press for its entire
      // hold so it cannot select/drag/resize/connect.
      const cursor = this.world.getEntity('cursor');
      if (cursor) {
        toolState.suppressedPressCount = cursor.getComponent(MouseComponent).pressCount;
      }
    }

    const textarea = this.textarea;
    this.textarea = null;
    this.editingEntityId = null;
    if (textarea.parentElement) {
      textarea.parentElement.removeChild(textarea);
    }
    this.committing = false;

    // One history snapshot per committed edit (blur and Escape alike), after
    // all edit state is torn down so the snapshot sees the final world.
    if (entity && effectiveContent !== this.initialContent) {
      this.onContentChanged();
    }
  }
}
