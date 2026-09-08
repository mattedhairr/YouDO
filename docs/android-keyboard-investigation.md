# Android keyboard gap investigation

Status: candidate correction; affected-device verification pending.

The owner reproduced the blank strip above the keyboard in the published
v7.1.0 APK on Samsung Android 10. Its height follows the keyboard height.
The earlier passing web checks and signed APK build did not verify this behavior.

## Evidence and correction

- v7.1.0 already sets `adjustResize` in both the manifest and MainActivity, and
  fits the window to system bars. Adding that setting again cannot fix this case.
- The installed and locked Capacitor Android version is 8.5.0. Its built-in
  `SystemBars` plugin is registered even without `@capacitor/keyboard`.
- `SystemBars.initWindowInsetsListener()` installs a listener on the WebView's
  parent. For WebView 140+ and `viewport-fit=cover`, it applies `ime.bottom` as
  parent padding without an Android-version guard. This can reserve keyboard
  space a second time on a window already resized by Android.
- BridgeActivity loads the plugin synchronously during `super.onCreate()`.
  MainActivity now removes that parent listener and clears its padding afterward
  on API 24-34. The default fitted-window/adjustResize behavior owns the space.
  API 35+ retains the existing Capacitor listener for newer edge-to-edge behavior.
- No dependency files or CSS are patched. Package identity, signing, version,
  account data, and sync behavior are unchanged.

This is a source-backed explanation, not a measurement of the owner's phone.
The phone's WebView version and a before/after device test are still needed.

Related upstream reports:
- https://github.com/ionic-team/capacitor/issues/8412
- https://github.com/ionic-team/capacitor/issues/8466

## Candidate phone test

Use the signed APK artifact from the candidate branch, not the public release
asset. Record the GitHub Actions run/commit: the candidate retains v7.1.0/code 35
until the final release version is chosen. Installing over the existing app must
use the same signing identity; do not uninstall or clear data to test it.

1. Record the phone model, Android version, and Android System WebView version
   from Settings > Apps > Android System WebView (Chrome may be the provider).
2. Open New Task and focus the title, then description. The sheet should use
   the area above the keyboard without an extra keyboard-height blank strip.
3. Try the keyboard's normal and compact heights. Close/reopen it several times;
   the available form area should grow when the keyboard shrinks and vice versa.
4. Scroll to lower fields; verify they remain reachable. Dismiss without saving
   the test task. Check the login form on a spare/guest device or another existing
   text-entry form without signing out of an active workspace unnecessarily.
5. Rotate the phone and background/resume the app with the keyboard open. After
   dismissal, check the full page, status bar, and bottom navigation recover.
6. Check both available keyboard apps and light/dark themes. Before release,
   also check system bars and a keyboard-open form on Android 15 or newer.

If the strip remains, capture the installed candidate run, WebView version,
and a keyboard-open screenshot. Do not label the issue fixed or bump/publish
a new release solely because CI passes.
