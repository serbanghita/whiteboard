import { Component } from "@serbanghita-gamedev/ecs";

export interface IsLockedComponentProps {
  // The remote user holding the lock, and their assigned display color.
  userName: string;
  color: string;
}

export default class IsLockedComponent extends Component<IsLockedComponentProps> {
  public get userName(): string {
    return this.properties.userName;
  }

  public set userName(value: string) {
    this.properties.userName = value;
  }

  public get color(): string {
    return this.properties.color;
  }

  public set color(value: string) {
    this.properties.color = value;
  }
}
