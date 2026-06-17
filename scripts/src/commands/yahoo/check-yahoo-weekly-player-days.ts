import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv();

import "../../domains/yahoo/check-weekly-player-days";
