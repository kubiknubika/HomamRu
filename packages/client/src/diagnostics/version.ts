const raw: unknown = import.meta.env["VITE_BUILD_ID"];

/** Номер сборки: его подставляет CI. При запуске из исходников его нет. */
export const BUILD_ID: string | null = typeof raw === "string" && raw !== "" ? raw : null;

/** Версия игры для сохранения и дампа. */
export const GAME_VERSION = BUILD_ID ?? "dev";
