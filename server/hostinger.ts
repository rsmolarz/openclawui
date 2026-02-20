const HOSTINGER_BASE = "https://developers.hostinger.com";

function getHeaders(): Record<string, string> {
  const apiKey = process.env.HOSTINGER_API_KEY;
  if (!apiKey) throw new Error("HOSTINGER_API_KEY not configured");
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

async function hostingerFetch(path: string, options?: RequestInit) {
  const url = `${HOSTINGER_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: { ...getHeaders(), ...(options?.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Hostinger API ${res.status}: ${text}`);
  }
  return res.json();
}

export interface HostingerVM {
  id: number;
  hostname: string;
  state: string;
  plan: string;
  cpus: number;
  memory: number;
  disk: number;
  bandwidth: number;
  ip_addresses: Array<{ address: string; type: string }>;
  os: { name: string; version: string };
  data_center: { name: string; location: string };
  created_at: string;
  firewall?: { id: number; name: string } | null;
  [key: string]: any;
}

export interface HostingerMetrics {
  cpu: Array<{ timestamp: string; value: number }>;
  memory: Array<{ timestamp: string; value: number }>;
  disk: Array<{ timestamp: string; read: number; write: number }>;
  network: Array<{ timestamp: string; in: number; out: number }>;
  [key: string]: any;
}

export interface HostingerDockerProject {
  name: string;
  status: string;
  config_files: string[];
  [key: string]: any;
}

export interface HostingerDockerContainer {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  ports: Array<{ host: number; container: number; protocol: string }>;
  [key: string]: any;
}

export interface HostingerFirewall {
  id: number;
  name: string;
  is_synced: boolean;
  rules: Array<{
    id: number;
    protocol: string;
    port: string;
    source: string;
    source_detail: string;
    action: string;
  }>;
  [key: string]: any;
}

export interface HostingerAction {
  id: number;
  name: string;
  status: string;
  created_at: string;
  [key: string]: any;
}

export interface HostingerBackup {
  id: number;
  location: string;
  created_at: string;
  [key: string]: any;
}

export const hostinger = {
  async listVMs(): Promise<HostingerVM[]> {
    const data = await hostingerFetch("/api/vps/v1/virtual-machines");
    return Array.isArray(data) ? data : data?.data || [];
  },

  async getVM(vmId: number): Promise<HostingerVM> {
    return hostingerFetch(`/api/vps/v1/virtual-machines/${vmId}`);
  },

  async getMetrics(vmId: number, dateFrom?: string, dateTo?: string): Promise<HostingerMetrics> {
    let path = `/api/vps/v1/virtual-machines/${vmId}/metrics`;
    const params = new URLSearchParams();
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    if (params.toString()) path += `?${params}`;
    return hostingerFetch(path);
  },

  async startVM(vmId: number): Promise<HostingerAction> {
    return hostingerFetch(`/api/vps/v1/virtual-machines/${vmId}/start`, { method: "POST" });
  },

  async stopVM(vmId: number): Promise<HostingerAction> {
    return hostingerFetch(`/api/vps/v1/virtual-machines/${vmId}/stop`, { method: "POST" });
  },

  async restartVM(vmId: number): Promise<HostingerAction> {
    return hostingerFetch(`/api/vps/v1/virtual-machines/${vmId}/restart`, { method: "POST" });
  },

  async getActions(vmId: number): Promise<HostingerAction[]> {
    const data = await hostingerFetch(`/api/vps/v1/virtual-machines/${vmId}/actions`);
    return Array.isArray(data) ? data : data?.data || [];
  },

  async listDockerProjects(vmId: number): Promise<HostingerDockerProject[]> {
    const data = await hostingerFetch(`/api/vps/v1/virtual-machines/${vmId}/docker`);
    return Array.isArray(data) ? data : data?.data || [];
  },

  async getDockerContainers(vmId: number, projectName: string): Promise<HostingerDockerContainer[]> {
    const data = await hostingerFetch(`/api/vps/v1/virtual-machines/${vmId}/docker/${encodeURIComponent(projectName)}/containers`);
    return Array.isArray(data) ? data : data?.data || [];
  },

  async getDockerLogs(vmId: number, projectName: string): Promise<string> {
    const data = await hostingerFetch(`/api/vps/v1/virtual-machines/${vmId}/docker/${encodeURIComponent(projectName)}/logs`);
    return typeof data === "string" ? data : JSON.stringify(data);
  },

  async restartDockerProject(vmId: number, projectName: string): Promise<any> {
    return hostingerFetch(`/api/vps/v1/virtual-machines/${vmId}/docker/${encodeURIComponent(projectName)}/restart`, { method: "POST" });
  },

  async startDockerProject(vmId: number, projectName: string): Promise<any> {
    return hostingerFetch(`/api/vps/v1/virtual-machines/${vmId}/docker/${encodeURIComponent(projectName)}/start`, { method: "POST" });
  },

  async stopDockerProject(vmId: number, projectName: string): Promise<any> {
    return hostingerFetch(`/api/vps/v1/virtual-machines/${vmId}/docker/${encodeURIComponent(projectName)}/stop`, { method: "POST" });
  },

  async listFirewalls(): Promise<HostingerFirewall[]> {
    const data = await hostingerFetch("/api/vps/v1/firewalls");
    return Array.isArray(data) ? data : data?.data || [];
  },

  async getFirewall(firewallId: number): Promise<HostingerFirewall> {
    return hostingerFetch(`/api/vps/v1/firewalls/${firewallId}`);
  },

  async createFirewallRule(firewallId: number, rule: { protocol: string; port: string; source: string; source_detail?: string }): Promise<any> {
    return hostingerFetch(`/api/vps/v1/firewalls/${firewallId}/rules`, {
      method: "POST",
      body: JSON.stringify(rule),
    });
  },

  async syncFirewall(firewallId: number): Promise<any> {
    return hostingerFetch(`/api/vps/v1/firewalls/${firewallId}/sync`, { method: "POST" });
  },

  async listBackups(vmId: number): Promise<HostingerBackup[]> {
    const data = await hostingerFetch(`/api/vps/v1/virtual-machines/${vmId}/backups`);
    return Array.isArray(data) ? data : data?.data || [];
  },
};
