package com.mattedhairr.youdo;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.SystemClock;
import android.view.View;
import android.widget.RemoteViews;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.ColorUtils;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/** Draws the Up next, Progress and Room widgets from HomeWidgetStore and the live session. */
final class HomeWidgets {
    static final String ACTION_CARD = "com.mattedhairr.youdo.WIDGET_CARD";
    static final String EXTRA_ACTION = "widget_action";
    static final String EXTRA_TASK = "widget_task";
    static final String EXTRA_STOP_TASK = "youdo_widget_stop";

    /** A room-mate's dot goes out after this, in case the push that ended it was missed. */
    private static final long LIVE_MAX_MS = 4 * 60 * 60 * 1000L;

    private static final int[] SLOT = { R.id.room_slot0, R.id.room_slot1, R.id.room_slot2, R.id.room_slot3 };
    private static final int[] RING = { R.id.room_ring0, R.id.room_ring1, R.id.room_ring2, R.id.room_ring3 };
    private static final int[] AVATAR = { R.id.room_avatar0, R.id.room_avatar1, R.id.room_avatar2, R.id.room_avatar3 };
    private static final int[] INITIAL = { R.id.room_initial0, R.id.room_initial1, R.id.room_initial2, R.id.room_initial3 };
    private static final int[] TIME = { R.id.room_time0, R.id.room_time1, R.id.room_time2, R.id.room_time3 };
    private static final int[] AWAY = { R.id.room_away0, R.id.room_away1, R.id.room_away2, R.id.room_away3 };

    private static String lastSessionKey;

    private HomeWidgets() {}

    static void refreshAll(Context ctx) {
        refresh(ctx, UpNextWidget.class);
        refresh(ctx, ProgressWidget.class);
        refresh(ctx, RoomWidget.class);
    }

    static void refresh(Context ctx, Class<?> provider) {
        AppWidgetManager manager = AppWidgetManager.getInstance(ctx);
        int[] ids = manager.getAppWidgetIds(new ComponentName(ctx, provider));
        if (ids == null || ids.length == 0) return;
        for (int id : ids) render(ctx, manager, provider, id);
        if (provider == UpNextWidget.class) manager.notifyAppWidgetViewDataChanged(ids, R.id.widget_stack);
    }

    static void render(Context ctx, AppWidgetManager manager, Class<?> provider, int widgetId) {
        RemoteViews views;
        if (provider == UpNextWidget.class) views = upNext(ctx, widgetId);
        else if (provider == ProgressWidget.class) views = progress(ctx, widgetId);
        else views = room(ctx, widgetId);
        manager.updateAppWidget(widgetId, views);
    }

    static int count(Context ctx, Class<?> provider) {
        int[] ids = AppWidgetManager.getInstance(ctx).getAppWidgetIds(new ComponentName(ctx, provider));
        return ids == null ? 0 : ids.length;
    }

    /** Start, pause, resume or stop: Up next switches between its card stack and its timer. */
    static void onSessionChanged(Context ctx) {
        JSONObject session = SessionNotificationStore.sessionObject(ctx);
        String key = session == null ? "" : session.optString("taskId") + "|" + session.optLong("startTime")
            + "|" + session.optBoolean("isPaused") + "|" + session.optLong("pausedDuration");
        if (key.equals(lastSessionKey)) return;
        lastSessionKey = key;
        refresh(ctx, UpNextWidget.class);
    }

    /* ---------- Up next ---------- */

    private static RemoteViews upNext(Context ctx, int widgetId) {
        JSONObject snapshot = HomeWidgetStore.snapshot(ctx);
        JSONObject session = SessionNotificationStore.sessionObject(ctx);
        if (session != null) return sessionViews(ctx, snapshot, session);

        RemoteViews views = new RemoteViews(ctx.getPackageName(), R.layout.widget_up_next);
        Intent service = new Intent(ctx, UpNextWidgetService.class);
        service.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
        service.setData(Uri.parse(service.toUri(Intent.URI_INTENT_SCHEME)));
        views.setRemoteAdapter(R.id.widget_stack, service);
        views.setEmptyView(R.id.widget_stack, R.id.widget_empty);

        JSONArray today = snapshot == null ? null : snapshot.optJSONArray("today");
        int open = today == null ? 0 : today.length();
        views.setTextViewText(R.id.widget_count, open == 0 ? "" : open + " open");
        views.setTextViewText(R.id.widget_empty, snapshot == null ? "Open YouDO once to fill this widget." : "All done for today.");

        Intent card = new Intent(ctx, UpNextWidget.class).setAction(ACTION_CARD);
        card.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0);
        views.setPendingIntentTemplate(R.id.widget_stack, PendingIntent.getBroadcast(ctx, 36100 + widgetId, card, flags));
        views.setOnClickPendingIntent(R.id.widget_header, openApp(ctx));
        views.setOnClickPendingIntent(R.id.widget_empty, openApp(ctx));
        return views;
    }

    private static RemoteViews sessionViews(Context ctx, JSONObject snapshot, JSONObject session) {
        RemoteViews views = new RemoteViews(ctx.getPackageName(), R.layout.widget_up_next_session);
        boolean paused = session.optBoolean("isPaused", false);
        String taskId = session.optString("taskId");
        JSONObject card = HomeWidgetStore.find(snapshot, "today", taskId);

        long focused = SessionNotificationStore.elapsedFocusMs(session, paused);
        views.setChronometer(R.id.session_timer, SystemClock.elapsedRealtime() - focused, null, !paused);
        views.setTextViewText(R.id.session_state, paused ? "❚❚  PAUSED" : "●  FOCUSING");
        views.setTextColor(R.id.session_state, ContextCompat.getColor(ctx, paused ? R.color.widget_accent : R.color.widget_live));
        views.setTextViewText(R.id.session_title, SessionNotificationStore.title(ctx));

        String since = session.optString("wallClockStart", "");
        String meta = since.isEmpty() ? "" : "since " + since;
        if (card != null) meta += (meta.isEmpty() ? "" : " · ") + "#" + card.optInt("rank") + " today";
        views.setTextViewText(R.id.session_meta, meta);

        int done = card == null ? 0 : card.optInt("done");
        int total = card == null ? 0 : card.optInt("total");
        views.setProgressBar(R.id.session_ring, 100, total > 0 ? Math.min(100, done * 100 / total) : 0, false);
        views.setTextViewText(R.id.session_ring_label, total > 0 ? done + " of " + total + " steps" : "focus");

        views.setImageViewResource(R.id.session_toggle, paused ? R.drawable.ic_widget_resume : R.drawable.ic_widget_pause);
        views.setContentDescription(R.id.session_toggle, paused ? "Resume focus" : "Pause focus");
        views.setOnClickPendingIntent(R.id.session_toggle, SessionNotificationStore.actionIntent(ctx,
            paused ? SessionNotificationStore.ACTION_RESUME : SessionNotificationStore.ACTION_PAUSE));
        views.setOnClickPendingIntent(R.id.session_stop, stopIntent(ctx, taskId));
        views.setOnClickPendingIntent(R.id.widget_root, openApp(ctx));
        return views;
    }

    /* ---------- Progress ---------- */

    private static RemoteViews progress(Context ctx, int widgetId) {
        RemoteViews views = new RemoteViews(ctx.getPackageName(), R.layout.widget_progress);
        JSONObject snapshot = HomeWidgetStore.snapshot(ctx);
        JSONObject streak = snapshot == null ? null : snapshot.optJSONObject("streak");
        views.setTextViewText(R.id.progress_streak, String.valueOf(streak == null ? 0 : streak.optInt("days")));

        String goalId = HomeWidgetStore.choice(ctx, widgetId);
        JSONObject goal = HomeWidgetStore.find(snapshot, "goals", goalId);
        if (goal == null) {
            views.setTextViewText(R.id.progress_goal, snapshot == null ? "Open YouDO first"
                : goalId == null ? "Tap to choose a goal" : "Goal removed · tap to choose");
            views.setTextViewText(R.id.progress_pct, "");
            views.setProgressBar(R.id.progress_bar, 100, 0, false);
            views.setTextViewText(R.id.progress_sub_left, "");
            views.setTextViewText(R.id.progress_sub_right, "");
            views.setViewVisibility(R.id.progress_deadline, View.GONE);
            views.setOnClickPendingIntent(R.id.widget_root, configure(ctx, widgetId));
            return views;
        }

        int pct = Math.max(0, Math.min(100, goal.optInt("pct")));
        int done = goal.optInt("stepsDone");
        int total = goal.optInt("stepsTotal");
        views.setTextViewText(R.id.progress_goal, goal.optString("title"));
        views.setTextViewText(R.id.progress_pct, pct + "%");
        views.setProgressBar(R.id.progress_bar, 100, pct, false);

        Calendar deadline = goal.isNull("deadline") ? null : localDate(goal.optString("deadline"));
        if (deadline != null) {
            long days = Math.round((deadline.getTimeInMillis() - startOfToday().getTimeInMillis()) / 86_400_000.0);
            views.setViewVisibility(R.id.progress_deadline, View.VISIBLE);
            views.setTextViewText(R.id.progress_days, days >= 0 ? String.valueOf(days) : "!");
            views.setTextViewText(R.id.progress_days_label, days < 0 ? "OVERDUE" : days == 1 ? "DAY" : "DAYS");
            views.setTextViewText(R.id.progress_sub_left, done + " of " + total + " steps");
            views.setTextViewText(R.id.progress_sub_right, new SimpleDateFormat("MMM d", Locale.getDefault()).format(deadline.getTime()));
        } else {
            int left = Math.max(0, total - done);
            views.setViewVisibility(R.id.progress_deadline, View.GONE);
            views.setTextViewText(R.id.progress_sub_left, left == 0 ? "All steps done" : left + (left == 1 ? " step left" : " steps left"));
            views.setTextViewText(R.id.progress_sub_right, "no deadline");
        }
        views.setOnClickPendingIntent(R.id.widget_root, openApp(ctx));
        return views;
    }

    private static Calendar localDate(String iso) {
        try {
            String[] parts = iso.split("-");
            Calendar day = startOfToday();
            day.set(Integer.parseInt(parts[0]), Integer.parseInt(parts[1]) - 1, Integer.parseInt(parts[2].substring(0, 2)));
            return day;
        } catch (Exception e) {
            return null;
        }
    }

    private static Calendar startOfToday() {
        Calendar day = Calendar.getInstance();
        day.set(Calendar.HOUR_OF_DAY, 0);
        day.set(Calendar.MINUTE, 0);
        day.set(Calendar.SECOND, 0);
        day.set(Calendar.MILLISECOND, 0);
        return day;
    }

    /* ---------- Room ---------- */

    private static RemoteViews room(Context ctx, int widgetId) {
        RemoteViews views = new RemoteViews(ctx.getPackageName(), R.layout.widget_room);
        JSONObject snapshot = HomeWidgetStore.snapshot(ctx);
        String roomId = HomeWidgetStore.choice(ctx, widgetId);
        JSONObject room = HomeWidgetStore.find(snapshot, "rooms", roomId);
        if (room == null) {
            JSONArray rooms = snapshot == null ? null : snapshot.optJSONArray("rooms");
            boolean none = rooms == null || rooms.length() == 0;
            views.setTextViewText(R.id.room_name, none ? "Open YouDO to load your rooms" : roomId == null ? "Tap to choose a room" : "Room left · tap to choose");
            views.setTextViewText(R.id.room_live, "");
            views.setViewVisibility(R.id.room_members, View.GONE);
            views.setOnClickPendingIntent(R.id.widget_root, configure(ctx, widgetId));
            return views;
        }

        views.setViewVisibility(R.id.room_members, View.VISIBLE);
        views.setTextViewText(R.id.room_name, room.optString("name"));
        JSONArray members = room.optJSONArray("members");
        long now = System.currentTimeMillis();
        int live = 0;
        for (int i = 0; i < SLOT.length; i++) {
            JSONObject member = members == null ? null : members.optJSONObject(i);
            if (member == null) {
                views.setViewVisibility(SLOT[i], View.GONE);
                continue;
            }
            views.setViewVisibility(SLOT[i], View.VISIBLE);
            String state = member.optString("state", "idle");
            long startedAt = member.isNull("startedAt") ? 0 : member.optLong("startedAt");
            boolean inSession = !"idle".equals(state) && startedAt > 0 && now - startedAt < LIVE_MAX_MS;
            boolean paused = "paused".equals(state);
            int color = parseColor(member.optString("color"));

            views.setTextViewText(INITIAL[i], member.optString("initial", "?"));
            views.setInt(AVATAR[i], "setColorFilter", inSession ? color : ColorUtils.blendARGB(color, 0xFF8E8E93, 0.65f));
            views.setViewVisibility(RING[i], inSession ? View.VISIBLE : View.GONE);
            views.setViewVisibility(TIME[i], inSession ? View.VISIBLE : View.GONE);
            views.setViewVisibility(AWAY[i], inSession ? View.GONE : View.VISIBLE);
            if (inSession) {
                live++;
                // While paused the clock stops where the pause began (its last update).
                long end = paused ? Math.max(startedAt, member.optLong("updatedAt", now)) : now;
                long focused = Math.max(0, end - startedAt - Math.max(0, member.optLong("pausedMs")));
                views.setChronometer(TIME[i], SystemClock.elapsedRealtime() - focused, null, !paused);
            }
        }
        views.setTextViewText(R.id.room_live, live == 0 ? "Nobody focusing" : "●  " + live + " live");
        views.setTextColor(R.id.room_live, ContextCompat.getColor(ctx, live == 0 ? R.color.widget_text3 : R.color.widget_live));
        views.setOnClickPendingIntent(R.id.widget_root, openApp(ctx));
        return views;
    }

    private static int parseColor(String hex) {
        try {
            return Color.parseColor(hex);
        } catch (Exception e) {
            return 0xFF8A68C8;
        }
    }

    /* ---------- intents ---------- */

    private static int immutable() {
        return PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
    }

    static PendingIntent openApp(Context ctx) {
        Intent intent = new Intent(ctx, YouDoActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(ctx, 36001, intent, immutable());
    }

    private static PendingIntent stopIntent(Context ctx, String taskId) {
        Intent intent = new Intent(ctx, YouDoActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra(EXTRA_STOP_TASK, taskId);
        return PendingIntent.getActivity(ctx, 36002, intent, immutable());
    }

    private static PendingIntent configure(Context ctx, int widgetId) {
        Intent intent = new Intent(ctx, WidgetConfigActivity.class);
        intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
        intent.setData(Uri.parse("youdo-widget://configure/" + widgetId));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(ctx, 36200 + widgetId, intent, immutable());
    }
}
