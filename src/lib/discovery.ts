/** Daily discovery run in UTC — must match the cron in .github/workflows/discover.yml ("41 5 * * *"). */
export const DISCOVERY_UTC = { hour: 5, minute: 41 };
/** A run takes ~15 min and GitHub may start scheduled jobs late: show "scanning" for this long after the hour. */
export const DISCOVERY_RUN_MIN = 30;
export const DISCOVERY_PRS = "https://github.com/alfaiotadev/recomp.party/pulls?q=is%3Apr+label%3Adiscovery";
