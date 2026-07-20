import { Component } from "@serbanghita-gamedev/ecs";

export interface TextComponentProps {
  // Raw text including explicit \n; wrapping happens at layout time.
  content: string;
  // World units - text scales with camera zoom like shape strokes do.
  fontSize: number;
  fontFamily: string;
  color: string;
}

/**
 * Text inside a shape's interior (rectangle/circle). Added on the first
 * committed edit, removed when the committed content is empty - shapes
 * without text carry no TextComponent.
 */
export default class TextComponent extends Component<TextComponentProps> {
  constructor(public properties: TextComponentProps) {
    super(properties);
  }

  public get content(): string {
    return this.properties.content;
  }

  public set content(value: string) {
    this.properties.content = value;
  }

  public get fontSize(): number {
    return this.properties.fontSize;
  }

  public set fontSize(value: number) {
    this.properties.fontSize = value;
  }

  public get fontFamily(): string {
    return this.properties.fontFamily;
  }

  public set fontFamily(value: string) {
    this.properties.fontFamily = value;
  }

  public get color(): string {
    return this.properties.color;
  }

  public set color(value: string) {
    this.properties.color = value;
  }
}
