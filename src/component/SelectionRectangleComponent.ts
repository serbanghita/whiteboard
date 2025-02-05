import { Component, Entity } from "@serbanghita-gamedev/ecs";

export type SelectionRectangleComponentInitProps = {
  entities: Entity[]
}

export default class SelectionRectangleComponent extends Component {
  // The current selected Entities.
  public entities: Map<string, Entity> = new Map();
  public isDirty: boolean = true;

  constructor(public properties: SelectionRectangleComponentInitProps) {
    super(properties);

    // this.entities = new Map(properties.entities.map((entity) => [entity.id, entity]));
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
