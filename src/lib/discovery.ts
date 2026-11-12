/** Daily discovery run in UTC — must match the cron in .github/workflows/discover.yml ("41 5 * * *"). */
export const DISCOVERY_UTC = { hour: 5, minute: 41 };
export const DISCOVERY_PRS = "https://github.com/alfaiotadev/recomp.party/pulls?q=is%3Apr+label%3Adiscovery";
/** The "Suggest a project" issue form: a bot classifies the linked repo and opens a pull request for review. */
export const SUGGEST_URL = "https://github.com/alfaiotadev/recomp.party/issues/new?template=suggest-project.yml";
/** The suggestion form with its title prefilled, e.g. from a search that found nothing. */
export const suggestUrl = (game?: string) => (game ? `${SUGGEST_URL}&title=${encodeURIComponent(`Suggest: ${game}`)}` : SUGGEST_URL);
/** Open pull requests that propose projects: the daily discovery PR and PRs made from suggestion issues. */
export const CANDIDATE_PRS = "https://github.com/alfaiotadev/recomp.party/pulls?q=is%3Apr+is%3Aopen+label%3Adiscovery%2Csuggestion";
