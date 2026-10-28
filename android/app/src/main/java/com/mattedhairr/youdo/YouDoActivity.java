package com.mattedhairr.youdo;

import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
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

            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.VANILLA_ICE_CREAM) {
                // BridgeActivity has now loaded Capacitor 8's SystemBars plugin.
                // On WebView 140+ with viewport-fit=cover, its parent listener adds
                // ime.bottom padding even on Android versions where adjustResize
                // already shrinks the window. This reserves the keyboard twice.
                // Let the fitted window own resizing on Android 7-14; retain
                // SystemBars' edge-to-edge handling on Android 15 and newer.
                View webViewParent = (View) getBridge().getWebView().getParent();
                ViewCompat.setOnApplyWindowInsetsListener(webViewParent, null);
                webViewParent.setPadding(0, 0, 0, 0);
                ViewCompat.requestApplyInsets(webViewParent);
            }
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
