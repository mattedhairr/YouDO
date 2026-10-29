package com.mattedhairr.youdo;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;

import android.os.Build;
import android.os.SystemClock;
import android.widget.RemoteViews;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import java.text.DateFormat;
import java.util.Date;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

final class SessionNotificationStore {
    private static final long CLOCK_SKEW_MS = 3 * 60 * 1000L;
    static final int NOTIF_ID = 35001;
    static final String CHANNEL_ID = "youdo_focus_live";
    static final String ACTION_PAUSE = "pause";
    static final String ACTION_RESUME = "resume";

    private static final String PREFS = "youdo_session_native";
    private static final String KEY_JSON = "session_json";
    private static final String KEY_TITLE = "session_title";
    private static final String KEY_WALL_SAMPLE = "wall_sample";
    private static final String KEY_ELAPSED_SAMPLE = "elapsed_sample";

    private SessionNotificationStore() {}

    static boolean save(Context ctx, String sessionJson, String title) {
        long wall = System.currentTimeMillis();
        long elapsed = SystemClock.elapsedRealtime();
        boolean saved = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_JSON, sessionJson)
            .putString(KEY_TITLE, title)
            .putLong(KEY_WALL_SAMPLE, wall)
            .putLong(KEY_ELAPSED_SAMPLE, elapsed)
            .commit();
        if (saved) HomeWidgets.onSessionChanged(ctx);
        return saved;
    }

    /**
     * Start on the Up next widget, with YouDO closed. Shaped like the app's own
     * sessions; the app picks it up when it next opens (store.tsx).
     */
    static boolean startFromWidget(Context ctx, String taskId, String title) {
        if (sessionJson(ctx) != null || taskId == null || taskId.isEmpty()) return false;
        try {
            long now = System.currentTimeMillis();
            JSONObject session = new JSONObject();
            session.put("taskId", taskId);
            session.put("startTime", now);
            session.put("pausedDuration", 0);
            session.put("isPaused", false);
            session.put("lastHeartbeat", now);
            session.put("pauses", new JSONArray());
            session.put("wallClockStart", wallClock(now));
            session.put("nativeActionRevision", 1);
            String safeTitle = title == null || title.trim().isEmpty() ? "Focus Session" : title.trim();
            if (!save(ctx, session.toString(), safeTitle)) return false;
            show(ctx, false, safeTitle);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    static boolean clear(Context ctx) {
        if (!ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().commit()) return false;
        // A focus sound service holds this card while it plays; let it go first.
        FocusSoundService.stop(ctx);
        NotificationManagerCompat.from(ctx).cancel(NOTIF_ID);
        HomeWidgets.onSessionChanged(ctx);
        return true;
    }

    static String sessionJson(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_JSON, null);
    }

    static String title(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_TITLE, "Focus Session");
    }

    static JSONObject acceptWebSnapshot(Context ctx, String sessionJson, String title) throws Exception {
        JSONObject incoming = new JSONObject(sessionJson);
        JSONObject stored = sessionObject(ctx);
        if (stored != null && stored.optString("taskId").equals(incoming.optString("taskId"))
            && stored.optLong("startTime") == incoming.optLong("startTime")) {
            long storedRevision = stored.optLong("nativeActionRevision", 0);
            long incomingRevision = incoming.optLong("nativeActionRevision", 0);
            if (incomingRevision < storedRevision || (incomingRevision == storedRevision
                && incoming.optLong("lastHeartbeat") < stored.optLong("lastHeartbeat"))) {
                return stored;
            }
        }
        if (!save(ctx, sessionJson, title)) throw new IllegalStateException("Native timer save failed");
        return incoming;
    }

    static JSONObject applyAction(Context ctx, String action) {
        String raw = sessionJson(ctx);
        if (raw == null) return null;
        try {
            JSONObject session = new JSONObject(raw);
            long now = System.currentTimeMillis();
            if (!clockMatchesSample(ctx, now)) return null;
            if (now < session.optLong("lastHeartbeat", session.optLong("startTime", now))) return null;
            boolean paused = session.optBoolean("isPaused", false);
            if (ACTION_PAUSE.equals(action)) {
                if (paused) return session;
                long pauseAt = now;
                session.put("isPaused", true);
                session.put("pauseStart", pauseAt);
                session.put("lastHeartbeat", now);
                JSONArray pauses = session.optJSONArray("pauses");
                if (pauses == null) pauses = new JSONArray();
                JSONObject row = new JSONObject();
                row.put("start", pauseAt);
                row.put("wallClockStart", wallClock(pauseAt));
                pauses.put(row);
                session.put("pauses", pauses);
            } else if (ACTION_RESUME.equals(action)) {
                if (!paused) return session;
                long pauseStart = session.optLong("pauseStart", now);
                if (now < pauseStart) return null;
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
            session.put("nativeActionRevision", session.optLong("nativeActionRevision", 0) + 1);
            String title = title(ctx);
            if (!save(ctx, session.toString(), title)) return null;
            show(ctx, session.optBoolean("isPaused", false), title);
            return session;
        } catch (Exception e) {
            return null;
        }
    }

    static void show(Context ctx, boolean paused, String title) {
        android.app.Notification notification = build(ctx, paused, title);
        try {
            NotificationManagerCompat.from(ctx).notify(NOTIF_ID, notification);
        } catch (SecurityException ignored) {
            /* permission denied */
        }
    }

    /** The live card for the saved session; the focus sound service shows it while it runs. */
    static android.app.Notification buildCurrent(Context ctx) {
        JSONObject session = sessionObject(ctx);
        return build(ctx, session != null && session.optBoolean("isPaused", false), title(ctx));
    }

    private static android.app.Notification build(Context ctx, boolean paused, String title) {
        ensureChannel(ctx);
        String safeTitle = title == null || title.trim().isEmpty() ? "Focus Session" : title.trim();
        long elapsedMs = elapsedFocusMs(sessionObject(ctx), paused);
        long chronometerBase = System.currentTimeMillis() - elapsedMs;

        android.app.PendingIntent toggleIntent = actionIntent(ctx, paused ? ACTION_RESUME : ACTION_PAUSE);
        // A now-playing style card: the task, a live timer and one big
        // play/pause button. The timer runs on the elapsed-realtime clock so it
        // keeps counting with the screen off and never drifts with clock changes.
        long chronoBase = SystemClock.elapsedRealtime() - elapsedMs;
        RemoteViews compact = sessionViews(ctx, R.layout.notification_session, safeTitle, paused, chronoBase, toggleIntent);
        RemoteViews expanded = sessionViews(ctx, R.layout.notification_session_expanded, safeTitle, paused, chronoBase, toggleIntent);
        expanded.setTextViewText(R.id.notif_hint, paused ? "Tap play to continue · open YouDO" : "Tap to open YouDO");

        NotificationCompat.Builder builder = new NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_youdo)
            .setColor(paused ? 0xFF8FB394 : 0xFFC9A46E)
            .setColorized(false)
            .setContentTitle(safeTitle)
            .setContentText(paused ? "Paused" : "Focusing")
            .setCustomContentView(compact)
            .setCustomBigContentView(expanded)
            .setStyle(new NotificationCompat.DecoratedCustomViewStyle())
            .setOngoing(true)
            .setAutoCancel(false)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setShowWhen(false)
            .setWhen(chronometerBase)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setContentIntent(openAppIntent(ctx));
        return builder.build();
    }

    private static RemoteViews sessionViews(Context ctx, int layout, String title, boolean paused, long chronoBase, PendingIntent toggle) {
        RemoteViews views = new RemoteViews(ctx.getPackageName(), layout);
        views.setTextViewText(R.id.notif_title, title);
        views.setTextViewText(R.id.notif_status, paused ? "Paused" : "Focusing");
        views.setChronometer(R.id.notif_elapsed, chronoBase, null, !paused);
        views.setImageViewResource(R.id.notif_action, paused ? R.drawable.ic_notify_play : R.drawable.ic_notify_pause);
        views.setInt(R.id.notif_action, "setBackgroundResource", paused ? R.drawable.notif_action_bg_paused : R.drawable.notif_action_bg);
        views.setInt(R.id.notif_action, "setColorFilter", 0xFF14120F);
        views.setContentDescription(R.id.notif_action, paused ? "Resume focus" : "Pause focus");
        views.setOnClickPendingIntent(R.id.notif_action, toggle);
        return views;
    }

    static JSONObject sessionObject(Context ctx) {
        String raw = sessionJson(ctx);
        if (raw == null) return null;
        try {
            return new JSONObject(raw);
        } catch (Exception e) {
            return null;
        }
    }

    static long elapsedFocusMs(JSONObject session, boolean paused) {
        if (session == null) return 0;
        long now = System.currentTimeMillis();
        long start = session.optLong("startTime", now);
        long pausedDuration = Math.max(0, session.optLong("pausedDuration", 0));
        if (paused) {
            long pauseStart = session.optLong("pauseStart", now);
            pausedDuration += Math.max(0, now - pauseStart);
        }
        long displayEnd = now;
        return Math.max(0, displayEnd - start - pausedDuration);
    }

    private static boolean clockMatchesSample(Context ctx, long now) {
        android.content.SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!prefs.contains(KEY_WALL_SAMPLE) || !prefs.contains(KEY_ELAPSED_SAMPLE)) return true;
        long wallDelta = now - prefs.getLong(KEY_WALL_SAMPLE, now);
        long elapsedDelta = SystemClock.elapsedRealtime() - prefs.getLong(KEY_ELAPSED_SAMPLE, 0);
        return elapsedDelta >= 0 && Math.abs(wallDelta - elapsedDelta) <= CLOCK_SKEW_MS;
    }

    private static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = ctx.getSystemService(NotificationManager.class);
        if (manager == null) return;
        manager.deleteNotificationChannel("youdo_focus");
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Live Focus Session",
            NotificationManager.IMPORTANCE_DEFAULT
        );
        channel.setDescription("Live pause and resume controls for active focus sessions");
        channel.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);
        channel.enableVibration(false);
        channel.enableLights(false);
        channel.setSound(null, null);
        channel.setShowBadge(false);
        manager.createNotificationChannel(channel);
    }

    static PendingIntent actionIntent(Context ctx, String action) {
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
        Intent intent = new Intent(ctx, YouDoActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getActivity(ctx, 35010, intent, flags);
    }

    private static String wallClock(long ts) {
        return DateFormat.getTimeInstance(DateFormat.SHORT, Locale.US).format(new Date(ts));
    }
}
