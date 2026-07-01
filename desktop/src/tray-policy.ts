export function shouldHideToTray(
  platform: NodeJS.Platform,
  forceQuit: boolean,
): boolean {
  if (forceQuit) {
    return false;
  }

  return platform === "win32" || platform === "linux";
}

export function shouldShowTrayHint(hasShownTrayHint: boolean): boolean {
  return !hasShownTrayHint;
}
