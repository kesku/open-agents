export interface Session {
  created: number;
  authProvider: "local" | "vercel" | "github";
  user: {
    id: string;
    username: string;
    email: string | undefined;
    avatar: string;
    name?: string;
  };
}

export interface SessionUserInfo {
  user: Session["user"] | undefined;
  authProvider?: "local" | "vercel" | "github";
  isAdmin?: boolean;
  isManagedTemplateTrialUser?: boolean;
  hasGitHub?: boolean;
  hasGitHubAccount?: boolean;
  hasGitHubInstallations?: boolean;
  githubConnectionMode?: "github-app" | "local-token";
}
