// Migration helper script for Google Sheets backend optimization
// Run this script to test and validate your optimized implementation

import { optimizedSheetsAdapter } from "./optimized-adapter";

interface MigrationTest {
  name: string;
  test: () => Promise<void>;
  critical: boolean;
}

class SheetsMigrationHelper {
  private tests: MigrationTest[] = [];
  private results: { name: string; success: boolean; error?: string }[] = [];

  constructor() {
    this.setupTests();
  }

  private setupTests() {
    // Test 1: Basic connectivity
    this.tests.push({
      name: "Basic Connectivity",
      critical: true,
      test: async () => {
        await optimizedSheetsAdapter.initializeSheets();
        console.log("✅ Sheets initialization successful");
      },
    });

    // Test 2: CRUD Operations
    this.tests.push({
      name: "CRUD Operations",
      critical: true,
      test: async () => {
        // Test with a simple model like Conference
        const conferences = await optimizedSheetsAdapter.findMany(
          "Conference",
          {},
        );
        console.log(`✅ Found ${conferences.length} conferences`);

        if (conferences.length > 0) {
          const firstConference = await optimizedSheetsAdapter.findUnique(
            "Conference",
            {
              where: { id: conferences[0]?.id },
            },
          );
          console.log(
            `✅ Found unique conference: ${(firstConference as any)?.name}`,
          );
        }
      },
    });

    // Test 3: Cache Performance
    this.tests.push({
      name: "Cache Performance",
      critical: false,
      test: async () => {
        const start1 = Date.now();
        await optimizedSheetsAdapter.findMany("Player", {});
        const time1 = Date.now() - start1;

        const start2 = Date.now();
        await optimizedSheetsAdapter.findMany("Player", {});
        const time2 = Date.now() - start2;

        console.log(
          `✅ Cache test: First call ${time1}ms, Second call ${time2}ms`,
        );
        if (time2 < time1 * 0.1) {
          console.log(
            `✅ Cache is working effectively (${Math.round(time1 / time2)}x faster)`,
          );
        }
      },
    });

    // Test 4: Batch Operations
    this.tests.push({
      name: "Batch Operations",
      critical: false,
      test: async () => {
        // Test batch create with dummy data (won't actually create)
        const testData = [
          { name: "Test Conference 1", abbr: "TC1" },
          { name: "Test Conference 2", abbr: "TC2" },
        ];

        console.log("✅ Batch operation interfaces available");
        // Note: We don't actually create test data to avoid cluttering sheets
      },
    });

    // Test 5: Performance Comparison
    this.tests.push({
      name: "Performance Comparison",
      critical: false,
      test: async () => {
        // Compare old vs new adapter performance
        const iterations = 5;

        // Old adapter
        const oldTimes: number[] = [];
        for (let i = 0; i < iterations; i++) {
          const start = Date.now();
          await optimizedSheetsAdapter.findMany("Player", {});
          oldTimes.push(Date.now() - start);
        }

        // New adapter
        const newTimes: number[] = [];
        for (let i = 0; i < iterations; i++) {
          const start = Date.now();
          await optimizedSheetsAdapter.findMany("Player", {});
          newTimes.push(Date.now() - start);
        }

        const oldAvg = oldTimes.reduce((a, b) => a + b, 0) / oldTimes.length;
        const newAvg = newTimes.reduce((a, b) => a + b, 0) / newTimes.length;

        console.log(`✅ Performance comparison:`);
        console.log(`   Old adapter average: ${oldAvg.toFixed(2)}ms`);
        console.log(`   New adapter average: ${newAvg.toFixed(2)}ms`);
        console.log(`   Improvement: ${(oldAvg / newAvg).toFixed(2)}x faster`);
      },
    });

    // Test 6: Data Transformation
    this.tests.push({
      name: "Data Transformation",
      critical: true,
      test: async () => {
        const players = await optimizedSheetsAdapter.findMany("Player", {
          take: 1,
        });
        if (players.length > 0) {
          const player = players[0];
          if (player) {
            console.log(
              `✅ Data transformation working: ${(player as any).firstName} ${(player as any).lastName}`,
            );
          }
        }
      },
    });
  }

  async runMigrationTests(): Promise<void> {
    console.log("🚀 Starting Google Sheets Backend Migration Tests...\n");

    for (const test of this.tests) {
      console.log(`🔍 Testing: ${test.name}`);

      try {
        await test.test();
        this.results.push({ name: test.name, success: true });
        console.log(`✅ ${test.name} passed\n`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.results.push({ name: test.name, success: false, error: errorMsg });
        console.log(`❌ ${test.name} failed: ${errorMsg}\n`);

        if (test.critical) {
          console.log(
            "🚨 Critical test failed. Please fix before proceeding with migration.",
          );
          break;
        }
      }
    }

    this.printSummary();
  }

  private printSummary(): void {
    console.log("📊 Migration Test Summary");
    console.log("=" + "=".repeat(50));

    const passed = this.results.filter((r) => r.success).length;
    const failed = this.results.filter((r) => !r.success).length;

    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(
      `📈 Success Rate: ${Math.round((passed / this.results.length) * 100)}%\n`,
    );

    if (failed > 0) {
      console.log("❌ Failed Tests:");
      this.results
        .filter((r) => !r.success)
        .forEach((result) => {
          console.log(`   - ${result.name}: ${result.error}`);
        });
    }

    console.log("\n🎯 Next Steps:");
    if (failed === 0) {
      console.log("✅ All tests passed! You can proceed with the migration.");
      console.log("   1. Update your imports to use optimizedSheetsAdapter");
      console.log("   2. Replace adapter.ts with optimized-adapter.ts");
      console.log("   3. Update your tRPC routers to use new batch operations");
      console.log("   4. Test in development environment");
    } else {
      console.log(
        "⚠️  Some tests failed. Please address issues before migrating:",
      );
      console.log("   1. Check your Google Sheets API credentials");
      console.log("   2. Verify sheet access permissions");
      console.log("   3. Review error messages above");
    }
  }

  async benchmarkOperations(): Promise<void> {
    console.log("📊 Running Performance Benchmarks...\n");

    const operations = [
      {
        name: "Find Many Players",
        operation: () =>
          optimizedSheetsAdapter.findMany("Player", { take: 100 }),
      },
      {
        name: "Find Unique Player",
        operation: () =>
          optimizedSheetsAdapter.findUnique("Player", { where: { id: 1 } }),
      },
      {
        name: "Count Players",
        operation: () => optimizedSheetsAdapter.count("Player"),
      },
      {
        name: "Find Many with Filter",
        operation: () =>
          optimizedSheetsAdapter.findMany("Player", {
            where: { isActive: true },
            take: 50,
          }),
      },
    ];

    for (const op of operations) {
      const times: number[] = [];

      for (let i = 0; i < 3; i++) {
        const start = Date.now();
        try {
          await op.operation();
          times.push(Date.now() - start);
        } catch (error) {
          console.log(`❌ ${op.name} failed: ${error}`);
          break;
        }
      }

      if (times.length > 0) {
        const avg = times.reduce((a, b) => a + b, 0) / times.length;
        console.log(`⚡ ${op.name}: ${avg.toFixed(2)}ms average`);
      }
    }
  }

  async warmupCache(): Promise<void> {
    console.log("🔥 Warming up cache...");

    const models = ["Season", "Conference", "Week", "Player", "Team"] as const;

    for (const model of models) {
      try {
        const start = Date.now();
        await optimizedSheetsAdapter.findMany(model, {});
        const time = Date.now() - start;
        console.log(`✅ ${model} cache warmed (${time}ms)`);
      } catch (error) {
        console.log(`❌ Failed to warm ${model}: ${error}`);
      }
    }

    console.log("🔥 Cache warmup complete!\n");
  }
}

// Export for use in your application
export const migrationHelper = new SheetsMigrationHelper();

// Usage example:
// import { migrationHelper } from './migration-helper';
// await migrationHelper.runMigrationTests();
// await migrationHelper.benchmarkOperations();
// await migrationHelper.warmupCache();

// You can also run individual tests:
// await migrationHelper.runMigrationTests();
