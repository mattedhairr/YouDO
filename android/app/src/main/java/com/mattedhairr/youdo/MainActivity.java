package com.mattedhairr.youdo;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        registerPlugin(YouDoSessionNotificationPlugin.class);
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
}
