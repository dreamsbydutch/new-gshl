import assert from "node:assert/strict";
import test from "node:test";
import crons from "./crons";

type CronRegistry = {
  crons: Record<
    string,
    {
      name: string;
      schedule: Record<string, number | string>;
    }
  >;
};

const registry = crons as unknown as CronRegistry;

void test("background recovery cron cadences avoid minute-by-minute polling", () => {
  assert.deepEqual(registry.crons["dispatch due job schedules"]?.schedule, {
    minutes: 5,
    type: "interval",
  });
  assert.deepEqual(registry.crons["resolve due UFA offer groups"]?.schedule, {
    minutes: 15,
    type: "interval",
  });
});
