import { Component } from "@serbanghita-gamedev/ecs";

// The four connection handles (edge midpoints of a shape's bounding box).
export type ConnectionHandleId = 'n' | 'e' | 's' | 'w';

// One pinned line endpoint: which shape entity and which of its connection
// handles the endpoint sticks to.
export interface AttachmentPoint {
  entityId: string;
  handleId: ConnectionHandleId;
}

export interface LineAttachmentComponentProps {
  // Pins LineComponent.x1/y1.
  start: AttachmentPoint | null;
  // Pins LineComponent.x2/y2.
  end: AttachmentPoint | null;
}

/**
 * Records which shape(s) a line's endpoints are attached to.
 * LineAttachmentSystem re-pins the endpoints to the shapes' connection
 * points every frame, so attached lines follow shape moves and resizes.
 */
export default class LineAttachmentComponent extends Component<LineAttachmentComponentProps> {
  constructor(public properties: LineAttachmentComponentProps) {
    super(properties);
  }

  public get start(): AttachmentPoint | null {
    return this.properties.start;
  }

  public set start(value: AttachmentPoint | null) {
    this.properties.start = value;
  }

  public get end(): AttachmentPoint | null {
    return this.properties.end;
  }

  public set end(value: AttachmentPoint | null) {
    this.properties.end = value;
  }
}
