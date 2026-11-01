import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

const config = {
  // This app owns its dependencies. Only framework-free source is shared.
  outputFileTracingRoot: path.resolve(here, "../.."),
  webpack(config) {
    config.resolve.alias["@web"] = path.join(here, "src");
    config.resolve.alias["@sim"] = path.resolve(here, "../../sim-core/src");
    config.resolve.alias["@"] = path.resolve(here, "../../src");
    // Shared source lives outside this package; resolve its AVR dependency here.
    config.resolve.alias.avr8js = path.join(here, "node_modules/avr8js");
    return config;
  },
};

export default config;
