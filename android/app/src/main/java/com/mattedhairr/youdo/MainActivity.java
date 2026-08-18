package com.mattedhairr.youdo;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(YouDoSessionNotificationPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
