import React from "react";
import { Box, Text, useInput } from "ink";
import { theme, agentColor } from "../theme.js";
import { handleKey, INITIAL_RUNTIME, type VimRuntime } from "../util/vim-dispatch.js";
import type { VimMode } from "../util/vim.js";

export interface PromptInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  placeholder?: string;
  agent?: string;
  model?: string;
  provider?: string;
  disabled?: boolean;
  width?: number | string;
  /** Initial mode. Default "insert". */
  initialMode?: VimMode;
}

const EmptyBorder = {
  topLeft: " ",
  topRight: " ",
  bottomLeft: " ",
  bottomRight: " ",
  vertical: " ",
  horizontal: " ",
  topT: " ",
  bottomT: " ",
  leftT: " ",
  rightT: " ",
  cross: " ",
};

const SplitBorder = {
  ...EmptyBorder,
  vertical: "┃",
  bottomLeft: "╹",
};

function modeLabel(mode: VimMode): string {
  if (mode === "insert") return "-- INSERT --";
  if (mode === "normal") return "-- NORMAL --";
  return "-- VISUAL --";
}

function modeColor(mode: VimMode): string {
  if (mode === "insert") return theme.success;
  if (mode === "normal") return theme.primary;
  return theme.accent;
}

export function PromptInput({
  value,
  onChange,
  onSubmit,
  placeholder = 'Ask anything... "Fix a TODO in the codebase"',
  agent = "build",
  model,
  provider,
  disabled = false,
  width = "100%",
  initialMode = "insert",
}: PromptInputProps) {
  const accent = agentColor(agent);
  const [runtime, setRuntime] = React.useState<VimRuntime>(() => ({
    ...INITIAL_RUNTIME,
    state: { ...INITIAL_RUNTIME.state, text: value, cursor: value.length, mode: initialMode },
  }));
  const lastValueRef = React.useRef<string>(value);

  React.useEffect(() => {
    if (value !== lastValueRef.current) {
      const delta = value.length - lastValueRef.current.length;
      setRuntime((r) => {
        const newCursor =
          delta > 0
            ? Math.min(r.state.cursor + delta, value.length)
            : Math.max(0, r.state.cursor + delta);
        if (newCursor === r.state.cursor && value === r.state.text) return r;
        return { ...r, state: { ...r.state, text: value, cursor: newCursor } };
      });
      lastValueRef.current = value;
    }
  }, [value]);

  useInput((input: string, key: Record<string, boolean>) => {
    if (disabled) return;
    setRuntime((r) => {
      const next = handleKey(input, key, r);
      if (next.state.text !== r.state.text) {
        lastValueRef.current = next.state.text;
        onChange(next.state.text);
      }
      if (key.return && next.state.mode === "insert") {
        const trimmed = next.state.text.trim();
        if (trimmed.length > 0) onSubmit(trimmed);
        return { ...r, state: { ...next.state, mode: "insert", cursor: next.state.text.length, undoStack: [], pendingOp: "none", pendingCount: 0 } };
      }
      return next;
    });
  });

  const text = runtime.state.text;
  const cursor = clampCursor(text, runtime.state.cursor);
  const placeholderText = placeholder;
  const displayText = text || placeholderText;
  const textColor = text ? theme.text : theme.textMuted;
  const before = text.slice(0, cursor);
  const at = text[cursor] ?? "";
  const after = text.slice(cursor + at.length);
  const showHint = runtime.state.mode !== "insert";

  return (
    <Box flexDirection="column" width={width}>
      <Box flexDirection="row" width="100%">
        <Text color={accent}>┃</Text>
        <Box
          flexGrow={1}
          flexDirection="column"
          paddingX={2}
          paddingY={1}
        >
          <Box>
            <Text color={modeColor(runtime.state.mode)} bold>
              {modeLabel(runtime.state.mode)}
            </Text>
            {runtime.state.pendingOp !== "none" ? (
              <Text color={theme.warning}>  {runtime.state.pendingOp}{runtime.state.pendingCount > 0 ? runtime.state.pendingCount : ""}</Text>
            ) : null}
          </Box>
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
          <Box marginTop={1} justifyContent="space-between">
            <Box>
              <Text color={accent}>{agent}</Text>
              {model ? (
                <>
                  <Text>  </Text>
                  <Text color={theme.text}>{model}</Text>
                </>
              ) : null}
              {provider ? (
                <>
                  <Text>  </Text>
                  <Text color={theme.textMuted}>{provider}</Text>
                </>
              ) : null}
            </Box>
            {showHint ? (
              <Text color={theme.textMuted}>
                {runtime.state.mode === "normal" ? "i:insert  v:visual  :w/0/$" : "esc:normal  d:delete  y:yank"}
              </Text>
            ) : null}
          </Box>
        </Box>
      </Box>
      <Box flexDirection="row" width="100%">
        <Text color={accent}>┃</Text>
        <Box flexGrow={1}>
          <Text> </Text>
        </Box>
      </Box>
    </Box>
  );
}

function clampCursor(text: string, cursor: number): number {
  if (cursor < 0) return 0;
  if (cursor > text.length) return text.length;
  return cursor;
}

export { wordForward, wordBackward } from "./PromptInput-legacy.js";
export default PromptInput;
