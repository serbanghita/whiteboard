import { Component } from "@serbanghita-gamedev/ecs";

export type ToolType = "cursor" | "rectangle" | "circle" | "line";
export type DrawState = "IDLE" | "FIRST_POINT_SET";

export interface ToolStateComponentProps {
  currentTool: ToolType;
  drawState: DrawState;
  startX?: number;
  startY?: number;
  previewEntityId?: string;
}

export default class ToolStateComponent extends Component<ToolStateComponentProps> {
  constructor(public properties: ToolStateComponentProps) {
    super(properties);
  }

  public get currentTool(): ToolType {
    return this.properties.currentTool;
  }

  public set currentTool(tool: ToolType) {
    this.properties.currentTool = tool;
  }

  public get drawState(): DrawState {
    return this.properties.drawState;
  }

  public set drawState(state: DrawState) {
    this.properties.drawState = state;
  }

  public get startX(): number | undefined {
    return this.properties.startX;
  }

  public set startX(x: number | undefined) {
    this.properties.startX = x;
  }

  public get startY(): number | undefined {
    return this.properties.startY;
  }

  public set startY(y: number | undefined) {
    this.properties.startY = y;
  }

  public get previewEntityId(): string | undefined {
    return this.properties.previewEntityId;
  }

  public set previewEntityId(id: string | undefined) {
    this.properties.previewEntityId = id;
  }

  public reset(): void {
    this.properties.drawState = "IDLE";
    this.properties.startX = undefined;
    this.properties.startY = undefined;
    this.properties.previewEntityId = undefined;
  }
}
