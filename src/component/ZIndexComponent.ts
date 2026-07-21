import { Component } from "@serbanghita-gamedev/ecs";

export interface ZIndexComponentProps {
  // Server-assigned strictly-increasing draw order; shapes without the
  // component sort as 0 (stable sort keeps their creation order).
  zIndex: number;
}

export default class ZIndexComponent extends Component<ZIndexComponentProps> {
  public get zIndex(): number {
    return this.properties.zIndex;
  }

  public set zIndex(value: number) {
    this.properties.zIndex = value;
  }
}
