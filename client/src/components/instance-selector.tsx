import { useInstance } from "@/hooks/use-instance";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Server } from "lucide-react";

export function InstanceSelector() {
  const { instances, selectedInstanceId, setSelectedInstanceId, isLoading } = useInstance();

  if (isLoading || instances.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <Server className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      <Select
        value={selectedInstanceId ?? ""}
        onValueChange={setSelectedInstanceId}
      >
        <SelectTrigger
          className="h-8 w-[180px] text-xs"
          data-testid="select-instance"
        >
          <SelectValue placeholder="Select instance" />
        </SelectTrigger>
        <SelectContent>
          {instances.map((inst) => (
            <SelectItem
              key={inst.id}
              value={inst.id}
              data-testid={`select-instance-option-${inst.id}`}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${
                    inst.status === "online"
                      ? "bg-green-500"
                      : inst.status === "offline"
                      ? "bg-red-500"
                      : "bg-yellow-500"
                  }`}
                />
                <span className="truncate">{inst.name}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
