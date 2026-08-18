package com.mattedhairr.youdo;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.os.Build;
import android.widget.RemoteViews;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import java.text.DateFormat;
import java.util.Date;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

final class SessionNotificationStore {
    static final int NOTIF_ID = 35001;
    static final String CHANNEL_ID = "youdo_focus_live";
    static final String ACTION_PAUSE = "pause";
    static final String ACTION_RESUME = "resume";

    private static final String PREFS = "youdo_session_native";
    private static final String KEY_JSON = "session_json";
    private static final String KEY_TITLE = "session_title";

    private SessionNotificationStore() {}

    static void save(Context ctx, String sessionJson, String title) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_JSON, sessionJson)
            .putString(KEY_TITLE, title)
            .apply();
    }

    static void clear(Context ctx) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply();
        NotificationManagerCompat.from(ctx).cancel(NOTIF_ID);
    }

    static String sessionJson(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_JSON, null);
    }

    static String title(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_TITLE, "Sitting in progress");
    }

    static JSONObject applyAction(Context ctx, String action) {
        String raw = sessionJson(ctx);
        if (raw == null) return null;
        try {
            JSONObject session = new JSONObject(raw);
            long now = System.currentTimeMillis();
            boolean paused = session.optBoolean("isPaused", false);
            if (ACTION_PAUSE.equals(action)) {
                if (paused) return session;
                session.put("isPaused", true);
                session.put("pauseStart", now);
                session.put("lastHeartbeat", now);
                JSONArray pauses = session.optJSONArray("pauses");
                if (pauses == null) pauses = new JSONArray();
                JSONObject row = new JSONObject();
                row.put("start", now);
                row.put("wallClockStart", wallClock(now));
                pauses.put(row);
                session.put("pauses", pauses);
            } else if (ACTION_RESUME.equals(action)) {
                if (!paused) return session;
                long pauseStart = session.optLong("pauseStart", now);
                long pauseDuration = Math.max(0, now - pauseStart);
                session.put("isPaused", false);
                session.remove("pauseStart");
                session.put("pausedDuration", session.optLong("pausedDuration", 0) + pauseDuration);
                session.put("lastHeartbeat", now);
                JSONArray pauses = session.optJSONArray("pauses");
                if (pauses != null && pauses.length() > 0) {
                    JSONObject last = pauses.getJSONObject(pauses.length() - 1);
                    last.put("end", now);
                    last.put("wallClockEnd", wallClock(now));
                    last.put("durationMs", last.has("start") ? now - last.optLong("start") : pauseDuration);
                }
            } else {
                return session;
            }
            String title = title(ctx);
            save(ctx, session.toString(), title);
            show(ctx, session.optBoolean("isPaused", false), title);
            return session;
        } catch (Exception e) {
            return null;
        }
    }

    static void show(Context ctx, boolean paused, String title) {
        ensureChannel(ctx);
        String safeTitle = title == null || title.trim().isEmpty() ? "Sitting in progress" : title.trim();
        String status = paused ? "Paused" : "Focus · tap to pause";

        RemoteViews views = new RemoteViews(ctx.getPackageName(), R.layout.notification_session);
        views.setTextViewText(R.id.notif_status, status);
        views.setTextViewText(R.id.notif_title, safeTitle);
        views.setInt(
            R.id.notif_action,
            "setBackgroundResource",
            paused ? R.drawable.notif_action_bg_paused : R.drawable.notif_action_bg
        );
        views.setImageViewResource(R.id.notif_action, paused ? R.drawable.ic_notify_play : R.drawable.ic_notify_pause);
        views.setOnClickPendingIntent(R.id.notif_action, actionIntent(ctx, paused ? ACTION_RESUME : ACTION_PAUSE));

        NotificationCompat.Builder builder = new NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_youdo)
            .setColor(0xFFC4A574)
            .setContentTitle(paused ? "Paused" : "Focus")
            .setContentText(safeTitle)
            .setOngoing(true)
            .setAutoCancel(false)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setContentIntent(openAppIntent(ctx))
            .setCustomContentView(views)
            .setCustomBigContentView(views)
            .setStyle(new NotificationCompat.DecoratedCustomViewStyle())
            .setLargeIcon(bitmapFromDrawable(ctx, R.mipmap.ic_launcher));

        try {
            NotificationManagerCompat.from(ctx).notify(NOTIF_ID, builder.build());
        } catch (SecurityException ignored) {
            /* permission denied */
        }
    }

    private static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = ctx.getSystemService(NotificationManager.class);
        if (manager == null) return;
        manager.deleteNotificationChannel("youdo_focus");
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Focus sitting",
            NotificationManager.IMPORTANCE_DEFAULT
        );
        channel.setDescription("Live Pause and Resume while a sitting is running");
        channel.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);
        channel.enableVibration(false);
        channel.enableLights(false);
        channel.setSound(null, null);
        channel.setShowBadge(false);
        manager.createNotificationChannel(channel);
    }

    private static PendingIntent actionIntent(Context ctx, String action) {
        Intent intent = new Intent(ctx, SessionNotificationReceiver.class);
        intent.setAction("com.mattedhairr.youdo.SESSION_" + action.toUpperCase());
        intent.setPackage(ctx.getPackageName());
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        int requestCode = ACTION_PAUSE.equals(action) ? 35011 : 35012;
        return PendingIntent.getBroadcast(ctx, requestCode, intent, flags);
    }

    private static PendingIntent openAppIntent(Context ctx) {
        Intent intent = new Intent(ctx, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getActivity(ctx, 35010, intent, flags);
    }

    private static Bitmap bitmapFromDrawable(Context ctx, int resId) {
        Drawable d = ContextCompat.getDrawable(ctx, resId);
        if (d == null) return null;
        int w = Math.max(1, d.getIntrinsicWidth());
        int h = Math.max(1, d.getIntrinsicHeight());
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bmp);
        d.setBounds(0, 0, canvas.getWidth(), canvas.getHeight());
        d.draw(canvas);
        return bmp;
    }

    private static String wallClock(long ts) {
        return DateFormat.getTimeInstance(DateFormat.SHORT, Locale.US).format(new Date(ts));
    }
}
