import { Entity, Query, System, World } from "@serbanghita-gamedev/ecs";
import LineComponent from "../component/LineComponent";
import LineAttachmentComponent, { AttachmentPoint } from "../component/LineAttachmentComponent";
import SelectionRectangleComponent from "../component/SelectionRectangleComponent";
import { getConnectionPoints } from "../handles";

/**
 * LineAttachmentSystem keeps attached lines stuck to their shapes: every
 * frame it re-pins each attached endpoint to the shape's current connection
 * point. Runs after ResizeSystem/ConnectionSystem/DragSystem have mutated
 * shapes (and before SelectionSystem/RenderSystem), so drags and resizes in
 * the same frame are already reflected.
 *
 * Attachments to entities that disappeared (or stopped being a shape) are
 * cleared; a line with neither side attached loses the component entirely.
 */
export default class LineAttachmentSystem extends System {
  public constructor(
    public world: World,
    public query: Query,
  ) {
    super(world, query);
  }

  public update(now: number): void {
    const selectionEntity = this.world.getEntity('selection');
    const selectionComp = selectionEntity?.getComponent(SelectionRectangleComponent);

    // Snapshot: clearing both sides removes the component, which mutates the
    // query's dataset mid-iteration.
    for (const entity of [...this.query.execute().values()]) {
      const attachment = entity.getComponent(LineAttachmentComponent);
      const line = entity.getComponent(LineComponent);

      let moved = this.pinSide(attachment, 'start', line);
      moved = this.pinSide(attachment, 'end', line) || moved;

      if (attachment.start === null && attachment.end === null) {
        entity.removeComponent(LineAttachmentComponent);
      }

      // If a pinned line is itself selected, its handles/bbox must follow.
      if (moved && selectionComp?.hasEntity(entity)) {
        selectionComp.isDirty = true;
      }
    }
  }

  // Re-pins one endpoint to its shape's connection point. Returns whether
  // the endpoint actually moved; clears the side if the shape is gone.
  private pinSide(attachment: LineAttachmentComponent, side: 'start' | 'end', line: LineComponent): boolean {
    const ref: AttachmentPoint | null = attachment[side];
    if (!ref) {
      return false;
    }

    const target = this.world.getEntity(ref.entityId);
    const point = target && getConnectionPoints(target).find((handle) => handle.id === ref.handleId);
    if (!point) {
      attachment[side] = null;
      return false;
    }

    if (side === 'start') {
      if (line.x1 === point.x && line.y1 === point.y) {
        return false;
      }
      line.x1 = point.x;
      line.y1 = point.y;
    } else {
      if (line.x2 === point.x && line.y2 === point.y) {
        return false;
      }
      line.x2 = point.x;
      line.y2 = point.y;
    }
    return true;
  }
}
