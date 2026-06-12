import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme.js";
import type { PlanTodo } from "./plan-mode-utils.js";

export interface PlanModeWidgetProps {
  items: PlanTodo[];
  width?: number;
  visible?: boolean;
}

export function PlanModeWidget({ items, visible = true }: PlanModeWidgetProps) {
  if (!visible || items.length === 0) return null;
  const done = items.filter((i) => i.completed).length;
  const total = items.length;
  return (
    <Box flexDirection="column" paddingX={2} marginTop={1}>
      <Box>
        <Text color={theme.warning} bold>📋 Plan </Text>
        <Text color={theme.text}>{done}/{total}</Text>
        {done === total ? <Text color={theme.success}>  ✓ all done</Text> : null}
      </Box>
      {items.map((it) => (
        <Text key={it.step} color={it.completed ? theme.textMuted : theme.text}>
          {it.completed ? "☑ " : "☐ "}{it.step}. {it.text}
        </Text>
      ))}
    </Box>
  );
}

export default PlanModeWidget;
