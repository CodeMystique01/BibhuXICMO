import { Octokit } from "@octokit/rest";
import { getIntegration } from "./oauth";

export async function githubClientFor(workspaceId: string): Promise<Octokit | null> {
  const integration = await getIntegration(workspaceId, "GITHUB");
  if (!integration) return null;
  return new Octokit({ auth: integration.accessToken });
}

export async function listRepos(workspaceId: string): Promise<
  Array<{
    id: number;
    fullName: string;
    defaultBranch: string;
    private: boolean;
  }>
> {
  const gh = await githubClientFor(workspaceId);
  if (!gh) return [];
  const res = await gh.rest.repos.listForAuthenticatedUser({
    per_page: 50,
    sort: "updated",
    visibility: "all",
    affiliation: "owner,collaborator,organization_member",
  });
  return res.data.map((r) => ({
    id: r.id,
    fullName: r.full_name,
    defaultBranch: r.default_branch,
    private: r.private,
  }));
}

/**
 * Create a branch off of base, add/replace a file, and open a PR.
 */
export async function openPullRequest({
  workspaceId,
  fullName,
  branch,
  baseBranch,
  filePath,
  fileContents,
  commitMessage,
  title,
  body,
}: {
  workspaceId: string;
  fullName: string;
  branch: string;
  baseBranch: string;
  filePath: string;
  fileContents: string;
  commitMessage: string;
  title: string;
  body: string;
}): Promise<{ url: string } | null> {
  const gh = await githubClientFor(workspaceId);
  if (!gh) return null;
  const [owner, repo] = fullName.split("/");

  // Get base SHA
  const { data: baseRef } = await gh.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${baseBranch}`,
  });
  const baseSha = baseRef.object.sha;

  // Create new branch (ignore if already exists)
  try {
    await gh.rest.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branch}`,
      sha: baseSha,
    });
  } catch (err) {
    const code = (err as { status?: number }).status;
    if (code !== 422) throw err;
  }

  // Get current file on new branch (if any) to get its sha
  let existingSha: string | undefined;
  try {
    const { data: existing } = await gh.rest.repos.getContent({
      owner,
      repo,
      path: filePath,
      ref: branch,
    });
    if (!Array.isArray(existing) && existing.type === "file") {
      existingSha = existing.sha;
    }
  } catch {
    // not found — ok
  }

  await gh.rest.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: filePath,
    branch,
    message: commitMessage,
    content: Buffer.from(fileContents).toString("base64"),
    sha: existingSha,
  });

  const { data: pr } = await gh.rest.pulls.create({
    owner,
    repo,
    title,
    head: branch,
    base: baseBranch,
    body,
  });
  return { url: pr.html_url };
}
