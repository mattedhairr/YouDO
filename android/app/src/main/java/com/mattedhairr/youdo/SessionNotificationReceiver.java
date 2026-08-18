package com.mattedhairr.youdo;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import org.json.JSONObject;

public class SessionNotificationReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        String action = intent.getAction();
        String mapped = null;
        if (action.endsWith("PAUSE")) mapped = SessionNotificationStore.ACTION_PAUSE;
        else if (action.endsWith("RESUME")) mapped = SessionNotificationStore.ACTION_RESUME;
        if (mapped == null) return;

        JSONObject session = SessionNotificationStore.applyAction(context, mapped);
        YouDoSessionNotificationPlugin.emitSession(session);
    }
}
