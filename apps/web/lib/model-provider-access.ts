import "server-only";

import { isLocalDeployment } from "@/lib/deployment/mode";

export function isDirectModelProvidersEnabled(): boolean {
  return isLocalDeployment();
}
