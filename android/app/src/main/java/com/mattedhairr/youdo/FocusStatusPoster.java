package com.mattedhairr.youdo;

import android.content.BroadcastReceiver;
import android.content.Context;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import org.json.JSONObject;

/**
 * Shares a session started, paused or resumed natively (widget or notification)
 * with room-mates while YouDO is closed, using this phone's widget key
 * (set_focus_status_by_widget in hub_widget_push.sql). Best effort: when it
 * fails, the app shares the state the next time it opens.
 */
final class FocusStatusPoster {
    private FocusStatusPoster() {}

    static void post(Context ctx, JSONObject session, BroadcastReceiver.PendingResult pending) {
        String[] api = HomeWidgetStore.api(ctx);
        if (api == null || session == null) {
            if (pending != null) pending.finish();
            return;
        }
        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                JSONObject body = new JSONObject();
                body.put("widget_key", api[2]);
                body.put("next_state", session.optBoolean("isPaused", false) ? "paused" : "focusing");
                body.put("focus_started_at", iso(session.optLong("startTime")));
                // Rounded like the app's focusShareFromSession, so both write the same row.
                body.put("focus_paused_ms", Math.round(Math.max(0, session.optLong("pausedDuration")) / 1000.0) * 1000);
                String base = api[0].endsWith("/") ? api[0].substring(0, api[0].length() - 1) : api[0];
                connection = (HttpURLConnection) new URL(base + "/rest/v1/rpc/set_focus_status_by_widget").openConnection();
                connection.setRequestMethod("POST");
                connection.setConnectTimeout(8000);
                connection.setReadTimeout(8000);
                connection.setDoOutput(true);
                connection.setRequestProperty("apikey", api[1]);
                connection.setRequestProperty("Authorization", "Bearer " + api[1]);
                connection.setRequestProperty("Content-Type", "application/json");
                try (OutputStream out = connection.getOutputStream()) {
                    out.write(body.toString().getBytes(StandardCharsets.UTF_8));
                }
                connection.getResponseCode();
            } catch (Exception ignored) {
                /* offline or no key yet: the app shares it when it opens */
            } finally {
                if (connection != null) connection.disconnect();
                if (pending != null) pending.finish();
            }
        }).start();
    }

    private static String iso(long epochMs) {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date(epochMs));
    }
}
