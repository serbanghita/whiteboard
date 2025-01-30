import { Component, Entity } from "@serbanghita-gamedev/ecs";

export type SelectionRectangleComponentInitProps = {
  entities: Entity[]
}

export default class SelectionRectangleComponent extends Component {
  // The current selected Entities.
  public entities: Map<string, Entity> = new Map();

  constructor(public properties: SelectionRectangleComponentInitProps) {
    super(properties);

    // this.entities = new Map(properties.entities.map((entity) => [entity.id, entity]));
  }

  public addEntity(entity: Entity) {
    this.entities.set(entity.id, entity);
  }

  public removeEntity(entity: Entity) {
    this.entities.delete(entity.id);
  }

  public clear() {
    this.entities.clear();
  }
}
