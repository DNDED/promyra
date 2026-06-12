import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme.js";

function clampCursor(text: string, cursor: number): number {
  if (cursor < 0) return 0;
  if (cursor > text.length) return text.length;
  return cursor;
}

function wordForward(text: string, from: number): number {
  if (from >= text.length) return text.length;
  let i = from;
  const atWord = /\w/.test(text[i] ?? "");
  if (atWord) {
    while (i < text.length && /\w/.test(text[i] ?? "")) i++;
  }
  while (i < text.length && !/\w/.test(text[i] ?? "")) i++;
  return i;
}

function wordBackward(text: string, from: number): number {
  if (from <= 0) return 0;
  let i = from;
  if (i > text.length) i = text.length;
  while (i > 0 && !/\w/.test(text[i - 1] ?? "")) i--;
  while (i > 0 && /\w/.test(text[i - 1] ?? "")) i--;
  return i;
}

export interface LegacyPromptInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  width?: number | string;
}

export function LegacyPromptInput({
  value,
  onChange,
  onSubmit,
  placeholder = "Ask anything...",
  disabled = false,
  width = "100%",
}: LegacyPromptInputProps) {
  const [cursor, setCursor] = React.useState<number>(value.length);
  const lastValueRef = React.useRef<string>(value);

  React.useEffect(() => {
    if (value !== lastValueRef.current) {
      const delta = value.length - lastValueRef.current.length;
      setCursor((c) => {
        if (delta > 0) return clampCursor(value, c + delta);
        const removedAt = lastValueRef.current.length + delta;
        return clampCursor(value, removedAt < c && c <= removedAt - delta ? removedAt : c);
      });
      lastValueRef.current = value;
    }
  }, [value]);

  React.useEffect(() => {
    if (value !== lastValueRef.current) {
      lastValueRef.current = value;
      setCursor((c) => clampCursor(value, c));
    }
  }, [value]);

  const text = value;
  const cursorClamped = clampCursor(text, cursor);
  const placeholderText = placeholder;
  const displayText = text || placeholderText;
  const textColor = text ? theme.text : theme.textMuted;
  const before = text.slice(0, cursorClamped);
  const at = text[cursorClamped] ?? "";
  const after = text.slice(cursorClamped + at.length);

  return (
    <Box flexDirection="row" width={width}>
      <Box flexGrow={1} flexDirection="column" paddingX={2} paddingY={1}>
        <Text color={textColor} wrap="wrap">
          {text ? (
            <>
              {before}
              {!disabled ? <Text color={theme.accent} inverse>{at || " "}</Text> : null}
              {after}
            </>
          ) : (
            <>
              {displayText}
              {!disabled ? <Text color={theme.text}>▌</Text> : null}
            </>
          )}
        </Text>
      </Box>
    </Box>
  );
}

export { wordForward, wordBackward };
export default LegacyPromptInput;
