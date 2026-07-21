import { Component } from "@serbanghita-gamedev/ecs";

export default class VersionComponent extends Component {
  public version: number = 1;

  public init(props?: { version?: number }): void {
    this.version = props?.version ?? 1;
  }

  public reset(): void {
    this.version = 1;
  }
}
