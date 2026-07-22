/**
 * Stroke rendering style shared by the shape components and the renderer.
 * Absent/undefined means solid - the string 'solid' is never stored, so
 * snapshots stay canonical (absent key), same idiom as ArrowStyle's 'none'.
 */
export type StrokeStyle = 'dashed' | 'dotted';
