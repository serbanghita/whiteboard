import { Component } from "@serbanghita-gamedev/ecs";

export interface CameraComponentProps {
  x: number;
  y: number;
  scale: number;
}

/**
 * The viewport camera: (x, y) is the world coordinate of the viewport's
 * top-left corner, scale is screen pixels per world unit (zoom factor).
 * Structurally satisfies CameraState (src/camera.ts).
 */
export default class CameraComponent extends Component<CameraComponentProps> {
  constructor(public properties: CameraComponentProps) {
    super(properties);
  }

  public get x(): number {
    return this.properties.x;
  }

  public set x(value: number) {
    this.properties.x = value;
  }

  public get y(): number {
    return this.properties.y;
  }

  public set y(value: number) {
    this.properties.y = value;
  }

  public get scale(): number {
    return this.properties.scale;
  }

  public set scale(value: number) {
    this.properties.scale = value;
  }
}
