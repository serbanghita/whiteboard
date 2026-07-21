import { Component } from "@serbanghita-gamedev/ecs";

export default class IsLockedComponent extends Component {
  public userName: string = '';
  public color: string = '#000000';

  public init(props?: { userName: string, color: string }): void {
    if (props) {
      this.userName = props.userName;
      this.color = props.color;
    }
  }

  public reset(): void {
    this.userName = '';
    this.color = '#000000';
  }
}
