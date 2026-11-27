/**
 * Where the pages for searches live. They are written only in English, so
 * the site keeps them left to right even when the visitor picked Persian
 * (SettingsContext reads this list). Kept apart from useCases.ts so every
 * page can know the paths without loading those pages' words.
 */
export const USE_CASE_PATHS = {
  spss: '/analyze-spss-file-without-spss',
  parquet: '/parquet-to-pdf-powerpoint',
  duplicates: '/remove-duplicate-survey-rows',
} as const;

export const ENGLISH_ONLY_PATHS: readonly string[] = Object.values(USE_CASE_PATHS);
