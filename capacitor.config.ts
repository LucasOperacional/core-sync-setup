import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "xyz.nxsplus.rastreio",
  appName: "NXS Plus",
  webDir: "dist/client",
  server: {
    url: "https://cyber.nxsplus.xyz",
    cleartext: false,
  },
};

export default config;
