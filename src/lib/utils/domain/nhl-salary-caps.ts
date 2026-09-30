export const NORMALIZED_SALARY_CAP = 100_000_000;

// Commissioner-supplied Ceiling figures, September 2026. The supplied Season
// is an END year (2006 = 2005–06); keys here are START years. Future figures
// are the commissioner's assumptions, not claims of announced NHL limits.
export const NHL_SALARY_CAP_BY_START_YEAR: Readonly<Record<number, number>> = {
  2005: 39_000_000,
  2006: 44_000_000,
  2007: 50_300_000,
  2008: 56_700_000,
  2009: 56_800_000,
  2010: 59_400_000,
  2011: 64_300_000,
  // The lockout-shortened season had a $60M formal Upper Limit, with a
  // one-season transition rule permitting clubs to spend up to $70.2M.
  2012: 60_000_000,
  2013: 64_300_000,
  2014: 69_000_000,
  2015: 71_400_000,
  2016: 73_000_000,
  2017: 75_000_000,
  2018: 79_500_000,
  2019: 81_500_000,
  2020: 81_500_000,
  2021: 81_500_000,
  2022: 82_500_000,
  2023: 83_500_000,
  2024: 88_000_000,
  2025: 95_500_000,
  2026: 104_000_000,
  2027: 113_500_000,
  2028: 119_200_000,
  2029: 125_100_000,
  2030: 131_400_000,
  2031: 138_000_000,
  2032: 144_900_000,
  2033: 152_100_000,
  2034: 159_700_000,
  2035: 167_700_000,
  2036: 176_100_000,
  2037: 184_900_000,
  2038: 194_100_000,
  2039: 203_800_000,
  2040: 214_000_000,
  2041: 224_700_000,
};
