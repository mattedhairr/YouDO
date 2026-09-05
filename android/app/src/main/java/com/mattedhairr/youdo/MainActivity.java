package com.mattedhairr.youdo;

import android.os.Bundle;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        registerPlugin(YouDoSessionNotificationPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
