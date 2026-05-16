import { getIntegration } from "./oauth";

type LinkedInUserInfo = {
  sub: string; // personal URN = urn:li:person:<sub>
  name?: string;
  email?: string;
};

async function getUserInfo(accessToken: string): Promise<LinkedInUserInfo | null> {
  const res = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return res.json();
}

export async function postToLinkedIn(
  workspaceId: string,
  text: string
): Promise<{ id: string; url: string } | null> {
  const integration = await getIntegration(workspaceId, "LINKEDIN");
  if (!integration) return null;

  const userInfo = await getUserInfo(integration.accessToken);
  if (!userInfo) return null;

  const authorUrn = `urn:li:person:${userInfo.sub}`;
  const body = {
    author: authorUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text },
        shareMediaCategory: "NONE",
      },
    },
    visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
  };

  const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${integration.accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`LinkedIn post failed: ${res.status}`);
  }
  const json = (await res.json()) as { id: string };
  const urn = json.id;
  const postId = urn.split(":").pop();
  return {
    id: urn,
    url: `https://www.linkedin.com/feed/update/${urn}`,
  };
}
