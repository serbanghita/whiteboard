import { Component } from "@serbanghita-gamedev/ecs";

export default class ZIndexComponent extends Component {
  public zIndex: number = 0;

  public init(props?: { zIndex: number }): void {
    if (props) {
      this.zIndex = props.zIndex;
    }
  }

  public reset(): void {
    this.zIndex = 0;
  }
}
