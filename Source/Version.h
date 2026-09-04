/**
 * @file Version.h
 * @brief Single source of truth for the application version.
 *
 * Kept in step with installer.iss's MyAppVersion and the git tag of the
 * matching release. UpdateCheck compares this against the newest GitHub
 * release, so a wrong value here means the app either nags forever or never
 * notices an update -- bump all three together when cutting a release.
 */
#ifndef KALEIDOSCOPE_VERSION_H
#define KALEIDOSCOPE_VERSION_H

/// Semantic version of this build, "major.minor.patch" (no leading "v").
#define KALEIDOSCOPE_VERSION "1.14.0"

#endif
