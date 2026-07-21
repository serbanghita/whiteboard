import { Component } from "@serbanghita-gamedev/ecs";

export interface TargetTransformComponentProps {
  // Remote-sync target geometry, lerped toward by InterpolationSystem.
  // x/y cover rectangles (top-left) and circles (center); x1..y2 cover line
  // endpoints. Only the keys relevant to the shape are set.
  x?: number;
  y?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
}

export default class TargetTransformComponent extends Component<TargetTransformComponentProps> {
  public get x(): number | undefined { return this.properties.x; }
  public set x(value: number | undefined) { this.properties.x = value; }

  public get y(): number | undefined { return this.properties.y; }
  public set y(value: number | undefined) { this.properties.y = value; }

  public get x1(): number | undefined { return this.properties.x1; }
  public set x1(value: number | undefined) { this.properties.x1 = value; }

  public get y1(): number | undefined { return this.properties.y1; }
  public set y1(value: number | undefined) { this.properties.y1 = value; }

  public get x2(): number | undefined { return this.properties.x2; }
  public set x2(value: number | undefined) { this.properties.x2 = value; }

  public get y2(): number | undefined { return this.properties.y2; }
  public set y2(value: number | undefined) { this.properties.y2 = value; }
}
