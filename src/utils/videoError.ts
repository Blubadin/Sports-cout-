import { t, type SupportedLanguage } from "../i18n";

export function getLocalizedVideoError(
  errorType: string | null,
  errorCode: number | null,
  language: SupportedLanguage,
): string {
  switch (errorType) {
    case "invalid_parameter":
      return t("video.errorInvalidParameter", language);
    case "html5_error":
      return t("video.errorHtml5", language);
    case "private_or_removed":
      return t("video.errorPrivateRemoved", language);
    case "embed_disabled":
      return t("video.errorEmbedDisabled", language);
    case "preview_iframe_restricted":
      return t("video.errorPreviewRestricted", language);
    case "browser_blocked":
      return t("video.errorBrowserBlocked", language);
    default:
      return errorCode !== null
        ? `YouTube Error (Error Code: ${errorCode})`
        : t("video.errorLoad", language);
  }
}
