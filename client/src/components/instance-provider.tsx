import { useState, useEffect, useMemo } from "react";
import { InstanceContext, useInstancesQuery } from "@/hooks/use-instance";

export function InstanceProvider({ children }: { children: React.ReactNode }) {
  const { data: instances = [], isLoading } = useInstancesQuery();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedId && instances.length > 0) {
      const defaultInst = instances.find((i) => i.isDefault);
      setSelectedId(defaultInst?.id ?? instances[0].id);
    }
  }, [instances, selectedId]);

  const value = useMemo(() => ({
    instances,
    selectedInstanceId: selectedId,
    selectedInstance: instances.find((i) => i.id === selectedId) ?? null,
    setSelectedInstanceId: setSelectedId,
    isLoading,
  }), [instances, selectedId, isLoading]);

  return (
    <InstanceContext.Provider value={value}>
      {children}
    </InstanceContext.Provider>
  );
}
