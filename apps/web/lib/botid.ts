import { checkBotId } from "botid/server";
import { isLocalDeployment } from "@/lib/deployment/mode";

/**
 * Shared Vercel BotID server-side configuration.
 *
 * `extraAllowedHosts` tells BotID which frontend origins are permitted to
 * call the protected endpoints — anything on our own domains plus Vercel
 * preview / sandbox URLs.
 */
export const botIdConfig = {
  advancedOptions: {
    extraAllowedHosts: [
      "vercel.com",
      "*.vercel.com",
      "*.vercel.dev",
      "*.vercel.run",
      "*.open-agents.dev",
    ],
  },
};

export async function checkBotProtection() {
  if (isLocalDeployment() || process.env.NODE_ENV !== "production") {
    return {
      isHuman: true,
      isBot: false,
      isVerifiedBot: false,
      bypassed: true,
    };
  }

  return checkBotId(botIdConfig);
}
