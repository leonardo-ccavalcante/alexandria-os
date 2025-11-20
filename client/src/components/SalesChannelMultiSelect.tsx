import { useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const SALES_CHANNELS = [
  "Wallapop",
  "Vinted",
  "Todo Colección",
  "Sitio web",
  "Iberlibro",
  "Amazon",
  "Ebay",
  "Casa del Libro",
  "Fnac",
] as const;

type SalesChannel = (typeof SALES_CHANNELS)[number];

interface SalesChannelMultiSelectProps {
  value: SalesChannel[];
  onChange: (channels: SalesChannel[]) => void;
  disabled?: boolean;
}

export function SalesChannelMultiSelect({
  value,
  onChange,
  disabled = false,
}: SalesChannelMultiSelectProps) {
  const [open, setOpen] = useState(false);

  const toggleChannel = (channel: SalesChannel) => {
    if (value.includes(channel)) {
      onChange(value.filter((c) => c !== channel));
    } else {
      onChange([...value, channel]);
    }
  };

  const removeChannel = (channel: SalesChannel, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(value.filter((c) => c !== channel));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-start text-left font-normal"
          disabled={disabled}
        >
          {value.length === 0 ? (
            <span className="text-muted-foreground">Seleccionar canales...</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {value.map((channel) => (
                <Badge
                  key={channel}
                  variant="secondary"
                  className="mr-1"
                >
                  {channel}
                  <button
                    className="ml-1 ring-offset-background rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        removeChannel(channel, e as any);
                      }
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => removeChannel(channel, e)}
                  >
                    <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <div className="max-h-[300px] overflow-auto p-1">
          {SALES_CHANNELS.map((channel) => {
            const isSelected = value.includes(channel);
            return (
              <div
                key={channel}
                className={cn(
                  "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                  isSelected && "bg-accent"
                )}
                onClick={() => toggleChannel(channel)}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    isSelected ? "opacity-100" : "opacity-0"
                  )}
                />
                {channel}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { SALES_CHANNELS };
export type { SalesChannel };
