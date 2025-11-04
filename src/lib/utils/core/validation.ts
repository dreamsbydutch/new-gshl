// Validation utility functions

export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function isValidYear(year: number): boolean {
  const currentYear = new Date().getFullYear();
  return year >= 2000 && year <= currentYear + 10;
}

export function isValidSalary(salary: string | number): boolean {
  const num = typeof salary === "string" ? parseFloat(salary) : salary;
  return !isNaN(num) && num >= 0 && num <= 20_000_000;
}

export function isValidJerseyNumber(num: number): boolean {
  return Number.isInteger(num) && num >= 1 && num <= 99;
}

export function isValidPosition(pos: string): boolean {
  const validPositions = [
    "C",
    "LW",
    "RW",
    "D",
    "G",
    "BENCHF",
    "BENCHD",
    "BENCHG",
    "IR",
  ];
  return validPositions.includes(pos.toUpperCase());
}

export function sanitizeInput(input: string): string {
  return input.trim().replace(/[<>]/g, "");
}

export function isValidId(id: string | number): boolean {
  if (typeof id === "number") {
    return Number.isInteger(id) && id > 0;
  }
  return id.length > 0 && id.trim() !== "";
}

export function isValidName(name: string): boolean {
  return name.trim().length >= 1 && name.trim().length <= 100;
}

export function isValidTeamName(name: string): boolean {
  return name.trim().length >= 1 && name.trim().length <= 50;
}
