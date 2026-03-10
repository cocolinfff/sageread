import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { AgentMode } from "@/types/thread";
import { Check, ChevronDown } from "lucide-react";

interface AgentSelectorProps {
  selectedAgentMode: AgentMode;
  onAgentModeSelect: (mode: AgentMode) => void;
  className?: string;
}

const AGENT_MODE_LABELS: Record<AgentMode, string> = {
  solo: "Solo",
  todo: "Todo",
};

export default function AgentSelector({ selectedAgentMode, onAgentModeSelect, className }: AgentSelectorProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div
          className={cn(
            "flex h-8 w-full min-w-0 cursor-pointer select-none items-center justify-between gap-2 overflow-hidden rounded-2xl border bg-background px-3 font-normal text-sm dark:bg-neutral-800 dark:text-neutral-200 dark:hover:border-neutral-600",
            className,
          )}
        >
          <div className="flex min-w-0 items-center gap-2 truncate">
            <span className="text-muted-foreground text-xs dark:text-neutral-400">Agent</span>
            <span className="truncate text-xs">{AGENT_MODE_LABELS[selectedAgentMode]}</span>
          </div>
          <ChevronDown className="h-3 w-3 flex-shrink-0" />
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-32 dark:border-neutral-700 dark:bg-neutral-800" align="start">
        {(["solo", "todo"] as const).map((mode) => (
          <DropdownMenuItem
            key={mode}
            className="cursor-pointer p-2 text-xs dark:hover:bg-neutral-700"
            onClick={() => onAgentModeSelect(mode)}
          >
            <span className="flex-1">{AGENT_MODE_LABELS[mode]}</span>
            {selectedAgentMode === mode ? <Check className="h-4 w-4 flex-shrink-0 dark:text-neutral-200" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
