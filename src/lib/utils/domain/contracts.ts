/**
 * Contract Domain Utilities
 * -------------------------
 * Business domain-specific functions for contract calculations and operations.
 */

import { SALARY_CAP } from "@gshl-types";

/**
 * Calculates the remaining cap space for a team based on their contracts.
 *
 * @param contracts - Array of contracts with CapHit property
 * @returns The remaining cap space (salary cap - total cap hit)
 */
export function calculateCapSpace(
  contracts: Array<{ CapHit?: string | null }>,
): number {
  const totalCapHit = contracts.reduce((sum, contract) => {
    const capHit = parseFloat(contract.CapHit ?? "0");
    return sum + (Number.isNaN(capHit) ? 0 : capHit);
  }, 0);

  return SALARY_CAP - totalCapHit;
}

/**
 * Calculates the percentage of salary cap used by a team's contracts.
 *
 * @param contracts - Array of contracts with CapHit property
 * @returns The percentage of salary cap used (0-100)
 */
export function calculateCapPercentage(
  contracts: Array<{ CapHit?: string | null }>,
): number {
  const totalCapHit = contracts.reduce((sum, contract) => {
    const capHit = parseFloat(contract.CapHit ?? "0");
    return sum + (Number.isNaN(capHit) ? 0 : capHit);
  }, 0);

  return (totalCapHit / SALARY_CAP) * 100;
}

