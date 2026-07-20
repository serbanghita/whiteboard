import { Component, Entity } from "@serbanghita-gamedev/ecs";
import type { AttachmentPoint } from "./LineAttachmentComponent";

export type SelectionRectangleComponentInitProps = {
  entities?: Entity[]
}

export default class SelectionRectangleComponent extends Component<SelectionRectangleComponentInitProps> {
  // The current selected Entities.
  public entities: Map<string, Entity>;
  public isDirty: boolean = true;
  // Set by ResizeSystem while a handle drag is active; MousePressSystem and
  // DragSystem skip presses claimed by a resize.
  public resizeHandleId: string | null = null;
  public connectionHandleId: string | null = null;
  // The connection point the dragged line endpoint would snap to, while a
  // connection drag is active. Written by ConnectionSystem, read by
  // RenderSystem for the highlight ring - UI feedback only.
  public connectionSnap: AttachmentPoint | null = null;

  constructor(public properties: SelectionRectangleComponentInitProps) {
    super(properties);

    this.entities = new Map((properties.entities ?? []).map((entity) => [entity.id, entity]));
  }

  public hasEntity(entity: Entity) {
    return this.entities.has(entity.id);
  }

  public addEntity(entity: Entity) {
    this.entities.set(entity.id, entity);
    this.isDirty = true;
  }

  public removeEntity(entity: Entity) {
    this.entities.delete(entity.id);
    this.isDirty = true;
  }

  public clear() {
    this.entities.clear();
    this.isDirty = true;
  }
}
