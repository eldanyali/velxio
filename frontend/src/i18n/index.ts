/**
 * react-i18next bootstrap. Loads the English source bundle synchronously and
 * lazy-imports the other locales on demand so the initial paint stays small
 * (each non-default JSON adds a few KB; loading 8 of them up front would
 * pad the bundle without payoff for English-speaking visitors).
 *
 * The active locale is determined in priority order:
 *   1. URL prefix (`/es/...`) — the source of truth, what crawlers see.
 *   2. velxio_locale cookie — sticky preference, shared with the blog.
 *   3. Browser languages — Accept-Language fallback.
 *   4. DEFAULT_LOCALE ("en") — last resort.
 *
 * The URL is the source of truth at runtime; the cookie only seeds the
 * very first navigation so a returning visitor lands on their language
 * without a redirect.
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import enCommon from "./locales/en/common.json";
import enReleases from "./locales/en/releases.json";
import enDocs from "./locales/en/docs.json";
import enDocs2 from "./locales/en/docs2.json";
import { DEFAULT_LOCALE, LOCALES, isLocale, type Locale } from "./config";
import { getLocaleFromPath } from "./path";
import { readLocaleCookie } from "./cookie";

const NAMESPACES = ["common"] as const;
type Namespace = (typeof NAMESPACES)[number];

const SUPPORTED_LANGS = LOCALES as readonly string[];

/**
 * Resolve the locale to start with. Runs once on mount before i18next
 * is initialised. URL beats cookie beats browser locale.
 */
function pickInitialLocale(): Locale {
  if (typeof window !== "undefined") {
    const fromUrl = getLocaleFromPath(window.location.pathname);
    if (fromUrl !== DEFAULT_LOCALE) return fromUrl;
    // URL is at default-locale root — fall through to other signals.
    const fromCookie = readLocaleCookie();
    if (fromCookie) return fromCookie;
    const navLangs = (
      navigator.languages?.length ? navigator.languages : [navigator.language]
    )
      .map(l => l?.toLowerCase() ?? "")
      .filter(Boolean);
    for (const tag of navLangs) {
      if (isLocale(tag)) return tag;
      const base = tag.split("-")[0];
      if (isLocale(base)) return base;
    }
  }
  return DEFAULT_LOCALE;
}

// Init is synchronous for the default locale (resources are inlined via
// the static import above), so we don't need to await the returned
// Promise for first-paint correctness. Awaiting it would force the
// project's tsconfig to enable top-level-await for ESM, which we're
// avoiding to keep build settings minimal.
void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        common: {
          ...enCommon,
          ...enReleases,
          docs: { ...enDocs.docs, ...enDocs2.docs },
        },
      },
    },
    lng: pickInitialLocale(),
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: SUPPORTED_LANGS,
    ns: NAMESPACES,
    defaultNS: "common",
    interpolation: { escapeValue: false }, // React already escapes
    react: {
      useSuspense: false, // we register resources synchronously in dev
    },
    detection: {
      // We make the locale decision ourselves in `pickInitialLocale`;
      // detector is left configured for future fallback paths only.
      order: ["path", "cookie", "navigator"],
      lookupCookie: "velxio_locale",
      caches: [], // we manage the cookie in src/i18n/cookie.ts
    },
  });

/**
 * Lazy-load a non-English locale's bundle and register it with i18next.
 * Returns once the resources are available so callers can `await` it
 * before triggering i18n.changeLanguage() for instant UI swap.
 */
export async function loadLocale(locale: Locale): Promise<void> {
  if (locale === DEFAULT_LOCALE) return;
  if (i18n.hasResourceBundle(locale, "common")) return;
  const [commonMod, releasesMod, docsMod, docs2Mod] = await Promise.all([
    import(`./locales/${locale}/common.json`),
    import(`./locales/${locale}/releases.json`),
    import(`./locales/${locale}/docs.json`),
    import(`./locales/${locale}/docs2.json`),
  ]);
  const docs1Body = (docsMod.default ?? docsMod).docs ?? {};
  const docs2Body = (docs2Mod.default ?? docs2Mod).docs ?? {};
  const merged = {
    ...(commonMod.default ?? commonMod),
    ...(releasesMod.default ?? releasesMod),
    docs: { ...docs1Body, ...docs2Body },
  };
  i18n.addResourceBundle(locale, "common", merged, true, true);
}

export { i18n };
export type { Locale, Namespace };
