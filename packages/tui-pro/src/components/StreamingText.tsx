import React from "react";
import { Text } from "ink";
import { parseLinks, type LinkSegment } from "../util/links.js";

export interface StreamingTextProps {
  text: string;
  color?: string;
  linkColor?: string;
}

export function StreamingText({
  text,
  color = "#e0e0ff",
  linkColor = "cyan",
}: StreamingTextProps): React.ReactElement {
  const segments = parseLinks(text);
  return (
    <Text color={color}>
      {segments.map((seg, i) => {
        if (seg.type === "text") return <Text key={i}>{seg.content}</Text>;
        return (
          <Text key={i} color={linkColor} underline>
            {seg.content}
          </Text>
        );
      })}
    </Text>
  );
}

export default StreamingText;
