import { ReplitConnectors } from "@replit/connectors-sdk";

const connectors = new ReplitConnectors();

export async function githubApi(endpoint: string, options: { method?: string; body?: any } = {}) {
  const response = await connectors.proxy("github", endpoint, {
    method: options.method || "GET",
    ...(options.body ? { body: JSON.stringify(options.body), headers: { "Content-Type": "application/json" } } : {}),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API ${response.status}: ${text}`);
  }
  return response.json();
}

export async function fetchAllUserRepos(): Promise<any[]> {
  const allRepos: any[] = [];
  let page = 1;
  const perPage = 100;
  while (true) {
    const repos = await githubApi(`/user/repos?per_page=${perPage}&page=${page}&sort=pushed&direction=desc&affiliation=owner,collaborator,organization_member`);
    if (!Array.isArray(repos) || repos.length === 0) break;
    allRepos.push(...repos);
    if (repos.length < perPage) break;
    page++;
  }
  return allRepos;
}

export async function updateRepoVisibility(owner: string, repo: string, isPrivate: boolean): Promise<any> {
  return githubApi(`/repos/${owner}/${repo}`, {
    method: "PATCH",
    body: { private: isPrivate },
  });
}
