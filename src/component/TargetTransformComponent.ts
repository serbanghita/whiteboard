import { Component } from "@serbanghita-gamedev/ecs";

export default class TargetTransformComponent extends Component {
  public x?: number;
  public y?: number;
  public x1?: number;
  public y1?: number;
  public x2?: number;
  public y2?: number;

  public init(props?: { x?: number, y?: number, x1?: number, y1?: number, x2?: number, y2?: number }): void {
    if (props) {
      if (props.x !== undefined) this.x = props.x;
      if (props.y !== undefined) this.y = props.y;
      if (props.x1 !== undefined) this.x1 = props.x1;
      if (props.y1 !== undefined) this.y1 = props.y1;
      if (props.x2 !== undefined) this.x2 = props.x2;
      if (props.y2 !== undefined) this.y2 = props.y2;
    }
  }

  public reset(): void {
    this.x = undefined;
    this.y = undefined;
    this.x1 = undefined;
    this.y1 = undefined;
    this.x2 = undefined;
    this.y2 = undefined;
  }
}
