import { System, Query, World } from "@serbanghita-gamedev/ecs";
import RectangleComponent from "../component/RectangleComponent";
import CircleComponent from "../component/CircleComponent";
import LineComponent from "../component/LineComponent";
import { IRenderer } from "../renderer";
import { getSelectionHandles, HANDLE_RADIUS } from "../handles";
import CameraComponent from "../component/CameraComponent";

// Selection visuals: a tight blue bounding box around the selected shapes,
// with gray ring resize handles at its corners. A single selected line gets
// handles at its endpoints instead of a box. Handle positions come from
// handles.ts, the same geometry ResizeSystem hit-tests against.
const SELECTION_STROKE_COLOR = "rgb(66 133 244)";
const HANDLE_FILL_COLOR = "white";
const HANDLE_STROKE_COLOR = "rgb(170 170 170)";
const HANDLE_STROKE_WIDTH = 3;

export default class RenderingSystem extends System {
  public constructor(
    public world: World,
    public query: Query,
    public renderer: IRenderer,
  ) {
    super(world, query);
  }

  public update(now: number): void {
    // Push the camera to the renderer before drawing. Selection UI sizes are
    // divided by the scale so handles and strokes stay constant on screen
    // (shape geometry and strokes scale with the world).
    let scale = 1;
    const cameraEntity = this.world.getEntity('camera');
    if (cameraEntity && cameraEntity.hasComponent(CameraComponent)) {
      const cam = cameraEntity.getComponent(CameraComponent);
      scale = cam.scale;
      this.renderer.setCamera(cam.scale, cam.x, cam.y);
    }

    this.renderer.clear();

    // Shapes. Hovering has no visual effect - feedback only exists for the
    // selected shapes, via the overlay below.
    this.query.execute().forEach((entity) => {
      if (entity.hasComponent(RectangleComponent)) {
        const comp = entity.getComponent(RectangleComponent);
        this.renderer.rectangle(comp.x, comp.y, comp.width, comp.height, {
          strokeColor: comp.strokeColor || "black",
          fillColor: comp.fillColor
        });
      } else if (entity.hasComponent(CircleComponent)) {
        const comp = entity.getComponent(CircleComponent);
        this.renderer.circle(comp.x, comp.y, comp.radius, {
          strokeColor: comp.strokeColor || "black",
          fillColor: comp.fillColor
        });
      } else if (entity.hasComponent(LineComponent)) {
        const comp = entity.getComponent(LineComponent);
        this.renderer.line(comp.x1, comp.y1, comp.x2, comp.y2, {
          strokeColor: comp.strokeColor || "black",
          strokeWidth: comp.strokeWidth
        });
      }
    });

    // Selection overlay - always on top of the shapes.
    this.renderSelectionOverlay(scale);
  }

  private renderSelectionOverlay(scale: number): void {
    const handles = getSelectionHandles(this.world);
    if (handles.length === 0) {
      return;
    }

    // Corner handles come with the bounding box; endpoint handles (single
    // selected line) are drawn without one (a line's box would be degenerate
    // for horizontal/vertical lines).
    const isBoxSelection = handles.some((handle) => handle.id === 'nw');
    if (isBoxSelection) {
      const selectionEntity = this.world.getEntity('selection');
      if (selectionEntity && selectionEntity.hasComponent(RectangleComponent)) {
        const bounds = selectionEntity.getComponent(RectangleComponent);
        this.renderer.rectangle(bounds.x, bounds.y, bounds.width, bounds.height, {
          strokeColor: SELECTION_STROKE_COLOR,
          strokeWidth: 1 / scale
        });
      }
    }

    handles.forEach((handle) => {
      const isConnectionHandle = handle.id === 'n' || handle.id === 'e' || handle.id === 's' || handle.id === 'w';

      if (isConnectionHandle) {
        this.renderer.circle(handle.x, handle.y, HANDLE_RADIUS / scale, {
          fillColor: SELECTION_STROKE_COLOR,
        });
      } else {
        this.drawHandle(handle.x, handle.y, scale);
      }
    });
  }

  private drawHandle(x: number, y: number, scale: number): void {
    this.renderer.circle(x, y, HANDLE_RADIUS / scale, {
      fillColor: HANDLE_FILL_COLOR,
      strokeColor: HANDLE_STROKE_COLOR,
      strokeWidth: HANDLE_STROKE_WIDTH / scale
    });
  }
}
