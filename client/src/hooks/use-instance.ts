import { createContext, useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import type { OpenclawInstance } from "@shared/schema";

type InstanceContextType = {
  instances: OpenclawInstance[];
  selectedInstanceId: string | null;
  selectedInstance: OpenclawInstance | null;
  setSelectedInstanceId: (id: string) => void;
  isLoading: boolean;
};

export const InstanceContext = createContext<InstanceContextType>({
  instances: [],
  selectedInstanceId: null,
  selectedInstance: null,
  setSelectedInstanceId: () => {},
  isLoading: true,
});

export function useInstance() {
  return useContext(InstanceContext);
}

export function useInstancesQuery() {
  return useQuery<OpenclawInstance[]>({
    queryKey: ["/api/instances"],
  });
}
