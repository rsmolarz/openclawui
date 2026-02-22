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
  firewall_group_id?: number | null;
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

function normalizeVM(raw: any): HostingerVM {
  const ipAddresses: Array<{ address: string; type: string }> = [];
  if (Array.isArray(raw.ipv4)) {
    for (const ip of raw.ipv4) {
      ipAddresses.push({ address: ip.address, type: "ipv4" });
    }
  }
  if (Array.isArray(raw.ipv6)) {
    for (const ip of raw.ipv6) {
      ipAddresses.push({ address: ip.address, type: "ipv6" });
    }
  }
  if (raw.ip_addresses && !raw.ipv4) {
    ipAddresses.push(...raw.ip_addresses);
  }

  let os = raw.os || { name: "Unknown", version: "" };
  if (!raw.os && raw.template) {
    os = { name: raw.template.name || "Unknown", version: "" };
  }

  let dataCenter = raw.data_center || { name: "Unknown", location: "" };
  if (!raw.data_center && raw.data_center_id) {
    dataCenter = { name: `DC #${raw.data_center_id}`, location: "" };
  }

  return {
    ...raw,
    ip_addresses: ipAddresses,
    os,
    data_center: dataCenter,
    firewall_group_id: raw.firewall_group_id ?? null,
  };
}

function formatDateParam(d: Date): string {
  return d.toISOString().split("T")[0];
}

export const hostinger = {
  async listVMs(): Promise<HostingerVM[]> {
    const data = await hostingerFetch("/api/vps/v1/virtual-machines");
    const list = Array.isArray(data) ? data : data?.data || [];
    return list.map(normalizeVM);
  },

  async getVM(vmId: number): Promise<HostingerVM> {
    const data = await hostingerFetch(`/api/vps/v1/virtual-machines/${vmId}`);
    return normalizeVM(data);
  },

  async getMetrics(vmId: number, dateFrom?: string, dateTo?: string, totalMemoryMB?: number): Promise<HostingerMetrics> {
    if (!dateFrom || !dateTo) {
      const now = new Date();
      dateTo = dateTo || formatDateParam(now);
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      dateFrom = dateFrom || formatDateParam(weekAgo);
    }
    const params = new URLSearchParams();
    params.set("date_from", dateFrom);
    params.set("date_to", dateTo);
    const path = `/api/vps/v1/virtual-machines/${vmId}/metrics?${params}`;
    const data = await hostingerFetch(path);
    const result: HostingerMetrics = { cpu: [], memory: [], disk: [], network: [] };

    function parseUsageMap(usageObj: any): Array<{ timestamp: string; value: number }> {
      if (!usageObj || typeof usageObj !== "object") return [];
      return Object.entries(usageObj)
        .map(([ts, val]) => ({
          timestamp: new Date(Number(ts) * 1000).toISOString(),
          value: Number(val),
        }))
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    }

    if (data.cpu_usage?.usage) {
      result.cpu = parseUsageMap(data.cpu_usage.usage);
    }
    if (data.ram_usage?.usage) {
      const totalMemBytes = totalMemoryMB ? totalMemoryMB * 1024 * 1024 : 0;
      if (data.ram_usage.unit === "bytes" && totalMemBytes > 0) {
        result.memory = Object.entries(data.ram_usage.usage)
          .map(([ts, val]) => ({
            timestamp: new Date(Number(ts) * 1000).toISOString(),
            value: Math.min(100, (Number(val) / totalMemBytes) * 100),
          }))
          .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      } else {
        result.memory = parseUsageMap(data.ram_usage.usage);
      }
    }
    const diskSource = data.disk_usage?.usage || data.disk_space?.usage;
    if (diskSource) {
      result.disk = Object.entries(diskSource)
        .map(([ts, val]: [string, any]) => ({
          timestamp: new Date(Number(ts) * 1000).toISOString(),
          read: typeof val === "object" ? Number(val.read || 0) : Number(val),
          write: typeof val === "object" ? Number(val.write || 0) : 0,
        }))
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    }

    const inTraffic = data.incoming_traffic?.usage;
    const outTraffic = data.outgoing_traffic?.usage;
    if (inTraffic || outTraffic) {
      const allTimestamps = new Set([
        ...Object.keys(inTraffic || {}),
        ...Object.keys(outTraffic || {}),
      ]);
      result.network = Array.from(allTimestamps)
        .sort()
        .map((ts) => ({
          timestamp: new Date(Number(ts) * 1000).toISOString(),
          in: Number(inTraffic?.[ts] || 0),
          out: Number(outTraffic?.[ts] || 0),
        }));
    }

    return result;
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
    const data = await hostingerFetch("/api/vps/v1/firewall");
    return Array.isArray(data) ? data : data?.data || [];
  },

  async getFirewall(firewallId: number): Promise<HostingerFirewall> {
    return hostingerFetch(`/api/vps/v1/firewall/${firewallId}`);
  },

  async createFirewallRule(firewallId: number, rule: { protocol: string; port: string; source: string; source_detail?: string }): Promise<any> {
    return hostingerFetch(`/api/vps/v1/firewall/${firewallId}/rules`, {
      method: "POST",
      body: JSON.stringify(rule),
    });
  },

  async syncFirewall(firewallId: number, virtualMachineId?: number): Promise<any> {
    if (virtualMachineId) {
      return hostingerFetch(`/api/vps/v1/firewall/${firewallId}/sync/${virtualMachineId}`, { method: "POST" });
    }
    const vms = await this.listVMs();
    const results = [];
    for (const vm of vms) {
      try {
        const result = await hostingerFetch(`/api/vps/v1/firewall/${firewallId}/sync/${vm.id}`, { method: "POST" });
        results.push(result);
      } catch (e) {
      }
    }
    return results.length === 1 ? results[0] : results;
  },

  async listBackups(vmId: number): Promise<HostingerBackup[]> {
    const data = await hostingerFetch(`/api/vps/v1/virtual-machines/${vmId}/backups`);
    return Array.isArray(data) ? data : data?.data || [];
  },

  async ensurePortsOpen(requiredPorts: string[] = ["22", "18789"]): Promise<{ checked: boolean; results: Array<{ port: string; action: string; firewallName: string }> }> {
    try {
      if (!process.env.HOSTINGER_API_KEY) {
        return { checked: false, results: [] };
      }
      const vms = await this.listVMs();
      if (!vms.length) return { checked: false, results: [] };
      const firewalls = await this.listFirewalls();
      if (!firewalls.length) return { checked: false, results: [] };

      const results: Array<{ port: string; action: string; firewallName: string }> = [];
      let needsSync = new Set<number>();

      for (const fw of firewalls) {
        for (const port of requiredPorts) {
          const existing = fw.rules?.find((r: any) => r.port === port && r.protocol === "TCP" && r.source === "any");
          if (existing) {
            results.push({ port, action: "already_open", firewallName: fw.name });
          } else {
            await this.createFirewallRule(fw.id, { protocol: "TCP", port, source: "any" });
            needsSync.add(fw.id);
            results.push({ port, action: "opened", firewallName: fw.name });
          }
        }
      }

      for (const fwId of needsSync) {
        await this.syncFirewall(fwId);
      }

      return { checked: true, results };
    } catch (err) {
      console.error("[Hostinger] Auto port check failed:", err);
      return { checked: false, results: [] };
    }
  },
};
