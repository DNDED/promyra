import React from "react";
import { Box, Text, useInput } from "ink";
import { theme, agentColor } from "../theme.js";
import { handleKey, INITIAL_RUNTIME, type VimRuntime } from "../util/vim-dispatch.js";
import type { VimMode, ExCommand } from "../util/vim.js";
import { getDefaultModes } from "@pi/config";
import { getModeDisplay } from "../util/agent-mode.js";

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
  /** Called when an ex command is executed (not "none"). */
  onExCommand?: (cmd: ExCommand) => void;
  /** Current agent mode (build/plan). When provided, shows badge. */
  agentMode?: string;
  /** Available agent modes for display. Default from @pi/config. */
  modes?: ReturnType<typeof getDefaultModes>;
  /** Called when Tab is pressed in any mode (cycle agent mode). */
  onTab?: () => void;
}

function modeLabel(mode: VimMode): string {
  if (mode === "insert") return "-- INSERT --";
  if (mode === "normal") return "-- NORMAL --";
  if (mode === "visual") return "-- VISUAL --";
  return "-- EX --";
}

function modeColor(mode: VimMode): string {
  if (mode === "insert") return theme.success;
  if (mode === "normal") return theme.primary;
  if (mode === "visual") return theme.accent;
  return theme.warning;
}

function exHelpLine(): string {
  return ":w write  :q quit  :q! force  :wq save+quit  :clear  :help  :mode";
}

function normalHint(): string {
  return "i:insert  v:visual  ::ex  ^w:del-word  h/l:move  w/b:word  0/$:line  Tab:mode";
}

function visualHint(): string {
  return "esc:normal  d:delete  y:yank  ::ex  Tab:mode";
}

function exHint(): string {
  return exHelpLine();
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
  onExCommand,
  agentMode,
  modes,
  onTab,
}: PromptInputProps) {
  const accent = agentColor(agent);
  const resolvedModes = modes ?? getDefaultModes();
  const showAgentBadge = agentMode !== undefined;
  const modeDisplay = agentMode ? getModeDisplay(agentMode, resolvedModes) : null;
  const [runtime, setRuntime] = React.useState<VimRuntime>(() => ({
    ...INITIAL_RUNTIME,
    state: { ...INITIAL_RUNTIME.state, text: value, cursor: value.length, mode: initialMode },
  }));
  const lastValueRef = React.useRef<string>(value);
  const lastExRef = React.useRef<ExCommand | null>(null);

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
    if (key.tab) {
      onTab?.();
      return;
    }
    setRuntime((r) => {
      const next = handleKey(input, key, r);
      if (next.state.text !== r.state.text) {
        lastValueRef.current = next.state.text;
        onChange(next.state.text);
      }
      if (key.return && next.state.mode === "insert") {
        const trimmed = next.state.text.trim();
        if (trimmed.length > 0) onSubmit(trimmed);
        return { ...r, state: { ...next.state, mode: "insert", cursor: next.state.text.length, undoStack: [], pendingOp: "none", pendingCount: 0, exBuf: "" } };
      }
      if (next.state.mode !== "ex" && r.state.mode === "ex" && next.state.lastExCommand.kind !== "none") {
        const cmd = next.state.lastExCommand;
        if (lastExRef.current !== cmd) {
          lastExRef.current = cmd;
          queueMicrotask(() => onExCommand?.(cmd));
        }
      }
      return next;
    });
  });

  const mode = runtime.state.mode;
  const text = runtime.state.text;
  const cursor = clampCursor(text, runtime.state.cursor);
  const placeholderText = placeholder;
  const displayText = text || placeholderText;
  const textColor = text ? theme.text : theme.textMuted;
  const before = text.slice(0, cursor);
  const at = text[cursor] ?? "";
  const after = text.slice(cursor + at.length);
  const inEx = mode === "ex";

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
            <Text color={modeColor(mode)} bold>
              {modeLabel(mode)}
            </Text>
            {showAgentBadge && modeDisplay ? (
              <Text color={modeDisplay.color} bold>  {modeDisplay.label}{modeDisplay.readOnly ? "  READ-ONLY" : ""}</Text>
            ) : null}
            {runtime.state.pendingOp !== "none" ? (
              <Text color={theme.warning}>  {runtime.state.pendingOp}{runtime.state.pendingCount > 0 ? runtime.state.pendingCount : ""}</Text>
            ) : null}
          </Box>
          {inEx ? (
            <Box>
              <Text color={theme.warning}>{runtime.state.exBuf || ":"}</Text>
              {!disabled ? <Text color={theme.accent} inverse> </Text> : null}
            </Box>
          ) : (
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
          )}
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
            {mode === "normal" ? (
              <Text color={theme.textMuted}>{normalHint()}</Text>
            ) : mode === "visual" ? (
              <Text color={theme.textMuted}>{visualHint()}</Text>
            ) : mode === "ex" ? (
              <Text color={theme.textMuted}>{exHint()}</Text>
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
