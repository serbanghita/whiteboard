import { Component } from "@serbanghita-gamedev/ecs";

export interface LayerProps {
  id: string;
  zIndex: number;
  visible: boolean;
}

export default class Layer extends Component<LayerProps> {
  constructor(public properties: LayerProps) {
    super(properties);
  }

  public get id(): string {
    return this.properties.id;
  }

  public set id(value: string) {
    this.properties.id = value;
  }

  public get zIndex(): number {
    return this.properties.zIndex;
  }

  public set zIndex(value: number) {
    this.properties.zIndex = value;
  }

  public get visible(): boolean {
    return this.properties.visible;
  }

  public set visible(value: boolean) {
    this.properties.visible = value;
  }
}
