package com.mattedhairr.youdo;

import android.content.Intent;
import android.graphics.Color;
import android.content.pm.PackageInfo;
import android.graphics.Rect;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

/**
 * The app's single screen. Home-screen entries are activity-aliases pointing
 * here (see AndroidManifest.xml): ".MainActivity" is the default icon and keeps
 * the component name older installs pinned to the home screen.
 */
public class YouDoActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        registerPlugin(YouDoSessionNotificationPlugin.class);
        registerPlugin(YouDoAppUpdatePlugin.class);
        registerPlugin(YouDoAppIconPlugin.class);
        registerPlugin(YouDoFocusSoundPlugin.class);
        registerPlugin(YouDoWidgetsPlugin.class);
        super.onCreate(savedInstanceState);

        // Keep Android system bars and the software keyboard outside the WebView.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        getWindow().setStatusBarColor(Color.rgb(17, 16, 14));
        getWindow().setNavigationBarColor(Color.rgb(17, 16, 14));
        getWindow().getDecorView().setBackgroundColor(Color.rgb(17, 16, 14));
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().setBackgroundColor(Color.rgb(17, 16, 14));
            keepWebViewClearOfBarsAndKeyboard();
        }
    }

    /** Whether the keyboard is up, for the check after each layout. */
    private boolean keyboardShown;

    /**
     * BridgeActivity has now loaded Capacitor 8's SystemBars plugin. On WebView
     * 140+ it lets the page draw under the bars and pads the window by the
     * keyboard, but still hands the keyboard on to the page, which then counts
     * it as a bottom safe area too: sheets lifted themselves by a keyboard's
     * height and left a black band above it. Where Android also shrinks the
     * window for the keyboard, it was reserved yet again.
     *
     * The same handling, except that the page never sees the keyboard, and the
     * window is padded only by what the keyboard really covers on screen
     * (nothing where Android has resized the window already). Older WebViews
     * keep SystemBars' own padding, which never passed the keyboard on.
     */
    private void keepWebViewClearOfBarsAndKeyboard() {
        if (webViewMajorVersion() < 140) return;
        View decor = getWindow().getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(decor, (view, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            keyboardShown = insets.isVisible(WindowInsetsCompat.Type.ime());
            padForKeyboard(view);
            return new WindowInsetsCompat.Builder(insets)
                .setInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout(),
                    Insets.of(bars.left, bars.top, bars.right, keyboardShown ? 0 : bars.bottom))
                .setInsets(WindowInsetsCompat.Type.ime(), Insets.NONE)
                .build();
        });
        // A resize for the keyboard lands after its insets do, so check again once laid out.
        decor.getViewTreeObserver().addOnGlobalLayoutListener(() -> padForKeyboard(decor));
        ViewCompat.requestApplyInsets(decor);
    }

    private void padForKeyboard(View view) {
        int bottom = 0;
        if (keyboardShown) {
            Rect visible = new Rect();
            view.getWindowVisibleDisplayFrame(visible);
            int[] at = new int[2];
            view.getLocationOnScreen(at);
            bottom = Math.max(0, at[1] + view.getHeight() - visible.bottom);
        }
        if (view.getPaddingLeft() != 0 || view.getPaddingTop() != 0 || view.getPaddingRight() != 0 || view.getPaddingBottom() != bottom) {
            view.setPadding(0, 0, 0, bottom);
        }
    }

    private int webViewMajorVersion() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return 0;
        PackageInfo info = WebView.getCurrentWebViewPackage();
        if (info == null || info.versionName == null) return 0;
        try {
            return Integer.parseInt(info.versionName.split("\\.")[0]);
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        // BridgeActivity also calls this with the launch intent on a cold start.
        String stopTask = intent == null ? null : intent.getStringExtra(HomeWidgets.EXTRA_STOP_TASK);
        if (stopTask != null) {
            HomeWidgetStore.queueStop(this, stopTask);
            intent.removeExtra(HomeWidgets.EXTRA_STOP_TASK);
        }
        super.onNewIntent(intent);
    }

    @Override
    public void onStop() {
        super.onStop();
        // Swapping the launcher entry while the app is in front can close it on
        // some phones, so a chosen icon is applied once the app is in the background.
        YouDoAppIconPlugin.applyPending(this);
    }
}
