# Android keyboard gap investigation

Status: confirmed fixed by the owner on the affected Samsung Android 10 device.

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

The affected phone uses Android System WebView 151.0.7922.199. The owner
installed the signed candidate from commit `0404080` over v7.1.0 and confirmed
that the blank strip is gone. This supplies the device verification missing
from the v7.1.0 release.

Related upstream reports:
- https://github.com/ionic-team/capacitor/issues/8412
- https://github.com/ionic-team/capacitor/issues/8466

## Verified phone test

The owner used the signed APK artifact from the candidate branch at commit
`0404080`. That test build retained v7.1.0/code 35 and used the permanent signing
identity, so it installed over the public release without uninstalling or
clearing data.

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

The keyboard-sized strip disappeared on the affected phone. Before publishing
v7.1.1/code 36, CI must still compile and verify the final signed APK. Android
15+ keeps Capacitor's existing system-bar handling and remains a regression
check for future device testing.
