import { Component } from "@serbanghita-gamedev/ecs";

export interface DrawnOnLayerProps {
  id: string;
}

export default class DrawnOnLayer extends Component<DrawnOnLayerProps> {
  constructor(public properties: DrawnOnLayerProps) {
    super(properties);
  }

  public get id(): string {
    return this.properties.id;
  }

  public set id(value: string) {
    this.properties.id = value;
  }
}
