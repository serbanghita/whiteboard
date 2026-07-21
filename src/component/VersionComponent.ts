import { Component } from "@serbanghita-gamedev/ecs";

export interface VersionComponentProps {
  // Server-authoritative revision counter. Local-only boards never carry
  // this component; its absence means "always undoable".
  version: number;
}

export default class VersionComponent extends Component<VersionComponentProps> {
  public get version(): number {
    return this.properties.version;
  }

  public set version(value: number) {
    this.properties.version = value;
  }
}
