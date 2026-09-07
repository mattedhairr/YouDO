package com.mattedhairr.youdo;

import android.graphics.Color;
import android.os.Bundle;
import android.view.WindowManager;
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
        // This prevents content from sliding under status icons and avoids the
        // light compositor surface some Android 10 devices expose while resizing.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        getWindow().setStatusBarColor(Color.rgb(17, 16, 14));
        getWindow().setNavigationBarColor(Color.rgb(17, 16, 14));
        getWindow().getDecorView().setBackgroundColor(Color.rgb(17, 16, 14));
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().setBackgroundColor(Color.rgb(17, 16, 14));
        }
    }
}
