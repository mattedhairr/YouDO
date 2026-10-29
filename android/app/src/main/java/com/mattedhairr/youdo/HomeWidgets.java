package com.mattedhairr.youdo;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.text.SpannableStringBuilder;
import android.text.style.StyleSpan;
import android.view.View;
import android.widget.RemoteViews;
import androidx.annotation.ColorRes;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.ColorUtils;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/** Draws the Day Arc (UpNextWidget) and Room widgets from HomeWidgetStore and the live session. */
final class HomeWidgets {
    static final String ACTION_CARD = "com.mattedhairr.youdo.WIDGET_CARD";
    static final String EXTRA_ACTION = "widget_action";
    static final String EXTRA_TASK = "widget_task";
    static final String EXTRA_STOP_TASK = "youdo_widget_stop";
    /** Where a tap should land in the app: "task:<id>", "goal:<id>" or "room:<id>". */
    static final String EXTRA_OPEN = "youdo_widget_open";
    /** Day Arc's views, picked by its chips. */
    static final String TAB_SCHEDULED = "scheduled";
    static final String TAB_BACKLOG = "backlog";
    static final String TAB_GOAL = "goal";

    /** A room-mate's dot goes out after this, in case the push that ended it was missed. */
    private static final long LIVE_MAX_MS = 4 * 60 * 60 * 1000L;
    /** YouDO's sand {light, dark}, until the app has sent its accent. */
    private static final int[] DEFAULT_ACCENT = { 0xFF8C6A3A, 0xFFC9A46E };
    /** widget_live {light, dark}, for tints that follow the phone's mode. */
    private static final int[] LIVE = { 0xFF17A04C, 0xFF3EE07A };
    /** The arc shows at most this many tasks. */
    private static final int MAX_SEGMENTS = 24;

    private static final int[] SLOT = { R.id.room_slot0, R.id.room_slot1, R.id.room_slot2, R.id.room_slot3 };
    private static final int[] RING = { R.id.room_ring0, R.id.room_ring1, R.id.room_ring2, R.id.room_ring3 };
    private static final int[] AVATAR = { R.id.room_avatar0, R.id.room_avatar1, R.id.room_avatar2, R.id.room_avatar3 };
    private static final int[] INITIAL = { R.id.room_initial0, R.id.room_initial1, R.id.room_initial2, R.id.room_initial3 };
    private static final int[] MEMBER = { R.id.room_member0, R.id.room_member1, R.id.room_member2, R.id.room_member3 };
    private static final int[] TIME = { R.id.room_time0, R.id.room_time1, R.id.room_time2, R.id.room_time3 };
    private static final int[] AWAY = { R.id.room_away0, R.id.room_away1, R.id.room_away2, R.id.room_away3 };

    private static String lastSessionKey;

    private HomeWidgets() {}

    static void refreshAll(Context ctx) {
        refresh(ctx, UpNextWidget.class);
        refresh(ctx, RoomWidget.class);
    }

    static void refresh(Context ctx, Class<?> provider) {
        AppWidgetManager manager = AppWidgetManager.getInstance(ctx);
        int[] ids = manager.getAppWidgetIds(new ComponentName(ctx, provider));
        if (ids == null || ids.length == 0) return;
        for (int id : ids) render(ctx, manager, provider, id);
    }

    static void render(Context ctx, AppWidgetManager manager, Class<?> provider, int widgetId) {
        manager.updateAppWidget(widgetId, provider == UpNextWidget.class ? dayArc(ctx, widgetId) : room(ctx, widgetId));
    }

    static int count(Context ctx, Class<?> provider) {
        int[] ids = AppWidgetManager.getInstance(ctx).getAppWidgetIds(new ComponentName(ctx, provider));
        return ids == null ? 0 : ids.length;
    }

    /** Start, pause, resume or stop: Day Arc switches between its views and the timer. */
    static void onSessionChanged(Context ctx) {
        String key = sessionKey(SessionNotificationStore.sessionObject(ctx));
        if (key.equals(lastSessionKey)) return;
        lastSessionKey = key;
        refresh(ctx, UpNextWidget.class);
    }

    private static String sessionKey(JSONObject session) {
        return session == null ? "" : session.optString("taskId") + "|" + session.optLong("startTime")
            + "|" + session.optBoolean("isPaused") + "|" + session.optLong("pausedDuration");
    }

    /* ---------- accent and colours ---------- */

    /** The app's accent as {light, dark}. */
    static int[] accent(JSONObject snapshot) {
        JSONObject accent = snapshot == null ? null : snapshot.optJSONObject("accent");
        if (accent == null) return DEFAULT_ACCENT;
        return new int[] {
            parseColor(accent.optString("light"), DEFAULT_ACCENT[0]),
            parseColor(accent.optString("dark"), DEFAULT_ACCENT[1]),
        };
    }

    /** A colour pair that follows the phone's light or dark mode (live on Android 12+). */
    static void tint(Context ctx, RemoteViews views, int viewId, String method, int[] pair) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) views.setColorInt(viewId, method, pair[0], pair[1]);
        else views.setInt(viewId, method, isNight(ctx) ? pair[1] : pair[0]);
    }

    /** Progress rings take a tint on Android 12+ only; older phones keep the drawable's colour. */
    static void tintProgress(RemoteViews views, int viewId, int[] pair) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            views.setColorStateList(viewId, "setProgressTintList", ColorStateList.valueOf(pair[0]), ColorStateList.valueOf(pair[1]));
        }
    }

    /** A widget colour resource, resolved for the phone's light or dark mode. */
    private static void color(Context ctx, RemoteViews views, int viewId, String method, @ColorRes int res) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) views.setColor(viewId, method, res);
        else views.setInt(viewId, method, ContextCompat.getColor(ctx, res));
    }

    private static boolean isNight(Context ctx) {
        return (ctx.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
    }

    /** The drawn parts (arc, gauge, lines) in the phone's current mode; they redraw with the widget. */
    private static ArcPainter.Palette palette(Context ctx, int[] accent) {
        return new ArcPainter.Palette(
            isNight(ctx) ? accent[1] : accent[0],
            ContextCompat.getColor(ctx, R.color.widget_track),
            ContextCompat.getColor(ctx, R.color.widget_text),
            ContextCompat.getColor(ctx, R.color.widget_overdue),
            ContextCompat.getColor(ctx, R.color.widget_live));
    }

    /** The widget's size in dp, {width, height}, as the launcher reports it (portrait). */
    private static int[] size(Context ctx, int widgetId, int fallbackW, int fallbackH) {
        Bundle options = AppWidgetManager.getInstance(ctx).getAppWidgetOptions(widgetId);
        int w = options == null ? 0 : options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH);
        int h = options == null ? 0 : options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT);
        return new int[] { w > 0 ? w : fallbackW, h > 0 ? h : fallbackH };
    }

    /* ---------- Day Arc ---------- */

    private static RemoteViews dayArc(Context ctx, int widgetId) {
        RemoteViews views = new RemoteViews(ctx.getPackageName(), R.layout.widget_up_next);
        JSONObject snapshot = HomeWidgetStore.snapshot(ctx);
        JSONObject session = SessionNotificationStore.sessionObject(ctx);
        JSONArray scheduled = list(snapshot, "today");
        JSONArray overdue = list(snapshot, "backlog");
        JSONArray goals = list(snapshot, "goals");
        int done = snapshot == null ? 0 : snapshot.optInt("todayDone");
        int[] accent = accent(snapshot);
        ArcPainter.Palette palette = palette(ctx, accent);
        // The arc gets what the header, card and chips leave of the widget.
        int[] size = size(ctx, widgetId, 330, 260);
        int[] arc = { size[0] - 30, Math.max(60, size[1] - 26 - 16 - 2 - 72 - 38) };
        String tab = HomeWidgetStore.tab(ctx, widgetId);

        streakBadge(ctx, views, snapshot);
        JSONObject front;
        if (session != null) {
            front = focusView(ctx, views, snapshot, session, scheduled, overdue, done, accent, palette, arc);
        } else if (TAB_GOAL.equals(tab) && goals.length() > 0) {
            front = goalView(ctx, views, widgetId, snapshot, goals, palette, arc);
        } else {
            if (TAB_GOAL.equals(tab)) tab = TAB_SCHEDULED;
            front = taskView(ctx, views, widgetId, snapshot, TAB_BACKLOG.equals(tab) ? overdue : scheduled, done,
                TAB_BACKLOG.equals(tab), accent, palette, arc);
        }
        chips(ctx, views, widgetId, session != null ? "" : tab, done, scheduled, overdue, goals, front);
        return views;
    }

    /** The streak in the header, or the amber countdown while a broken one can still be restored. */
    private static void streakBadge(Context ctx, RemoteViews views, JSONObject snapshot) {
        JSONObject streak = snapshot == null ? null : snapshot.optJSONObject("streak");
        JSONObject save = streak == null ? null : streak.optJSONObject("save");
        long left = save == null ? 0 : save.optLong("endsAt") - System.currentTimeMillis();
        if (left > 0) {
            views.setTextViewText(R.id.day_badge, "🔥 SAVE " + save.optInt("days") + " · " + timeLeft(left));
            color(ctx, views, R.id.day_badge, "setTextColor", R.color.widget_save);
            return;
        }
        int days = streak == null ? 0 : streak.optInt("days");
        views.setTextViewText(R.id.day_badge, days > 0 ? "🔥 " + days + (days == 1 ? " day" : " days") : "");
        color(ctx, views, R.id.day_badge, "setTextColor", R.color.widget_text2);
    }

    /** Scheduled or Backlog: a segment per task, the card in front in the strip. */
    private static JSONObject taskView(Context ctx, RemoteViews views, int widgetId, JSONObject snapshot, JSONArray cards,
                                       int done, boolean backlog, int[] accent, ArcPainter.Palette palette, int[] arc) {
        int n = cards.length();
        int index = clamp(HomeWidgetStore.index(ctx, widgetId), n);
        int[] segments = segments(backlog, backlog ? 0 : done, n, index);
        views.setImageViewBitmap(R.id.day_arc, ArcPainter.dayArc(arc[0], arc[1], segments, -1, dayFraction(), palette));
        views.setTextViewText(R.id.day_title, backlog ? "TODAY · BACKLOG" : "TODAY");
        color(ctx, views, R.id.day_title, "setTextColor", R.color.widget_text2);

        views.setViewVisibility(R.id.day_big, View.VISIBLE);
        views.setViewVisibility(R.id.day_timer, View.GONE);
        JSONObject focus = snapshot == null ? null : snapshot.optJSONObject("focus");
        long focusedToday = focus == null ? 0 : focus.optLong("todayMs");
        if (backlog) {
            views.setTextViewText(R.id.day_big, bold(String.valueOf(n)));
            color(ctx, views, R.id.day_big, "setTextColor", n > 0 ? R.color.widget_overdue : R.color.widget_text);
            JSONObject streak = snapshot == null ? null : snapshot.optJSONObject("streak");
            JSONObject save = streak == null ? null : streak.optJSONObject("save");
            boolean saving = save != null && save.optLong("endsAt") > System.currentTimeMillis();
            views.setTextViewText(R.id.day_sub, n == 0 ? "nothing overdue"
                : saving ? save.optString("hint") + "\nto restore your " + save.optInt("days") + "-day streak"
                : "overdue · oldest first");
        } else {
            SpannableStringBuilder big = bold(String.valueOf(done));
            big.append("/").append(String.valueOf(done + n));
            views.setTextViewText(R.id.day_big, big);
            color(ctx, views, R.id.day_big, "setTextColor", R.color.widget_text);
            views.setTextViewText(R.id.day_sub, done + n == 0 ? "nothing scheduled today"
                : "tasks done" + (focusedToday > 0 ? " · " + duration(focusedToday) + " focused" : ""));
        }
        views.setOnClickPendingIntent(R.id.day_arc_area, openApp(ctx));

        views.setViewVisibility(R.id.day_strip, View.VISIBLE);
        views.setViewVisibility(R.id.day_stats, View.GONE);
        views.setViewVisibility(R.id.day_pause, View.GONE);
        views.setViewVisibility(R.id.day_stop, View.GONE);
        if (n == 0) {
            emptyCard(ctx, views, backlog ? "Nothing overdue" : done > 0 ? "All done for today" : "Nothing scheduled");
            return null;
        }
        JSONObject card = cards.optJSONObject(index);
        fillCard(ctx, views, card, accent, (index + 1) + " of " + n);
        views.setViewVisibility(R.id.day_nav, n > 1 ? View.VISIBLE : View.GONE);
        views.setOnClickPendingIntent(R.id.day_prev, dayAction(ctx, widgetId, "prev", null));
        views.setOnClickPendingIntent(R.id.day_next_btn, dayAction(ctx, widgetId, "next", null));
        views.setViewVisibility(R.id.day_play, View.VISIBLE);
        tint(ctx, views, R.id.day_play_bg, "setColorFilter", accent);
        views.setOnClickPendingIntent(R.id.day_play, dayAction(ctx, widgetId, "start", card.optString("id")));
        return card;
    }

    /** The arc's segments: Scheduled lights the finished ones, then the open ones with the one in front marked. */
    private static int[] segments(boolean backlog, int done, int open, int index) {
        int total = Math.min(MAX_SEGMENTS, done + open);
        int[] segments = new int[total];
        for (int i = 0; i < total; i++) {
            int card = i - done;
            if (card < 0) segments[i] = ArcPainter.DONE;
            else if (card == index) segments[i] = backlog ? ArcPainter.LATE_NOW : ArcPainter.NOW;
            else segments[i] = backlog ? ArcPainter.LATE : ArcPainter.OPEN;
        }
        return segments;
    }

    /** The strip's card: due day, place and goal path, title, and the next step to do. */
    private static void fillCard(Context ctx, RemoteViews views, JSONObject card, int[] accent, String place) {
        Calendar due = card.isNull("due") ? null : localDate(card.optString("due"));
        views.setViewVisibility(R.id.day_due, due == null ? View.GONE : View.VISIBLE);
        if (due != null) views.setTextViewText(R.id.day_due, "Due " + new SimpleDateFormat("MMM d", Locale.getDefault()).format(due.getTime()));
        String origin = card.isNull("origin") ? "Quick task" : card.optString("origin");
        views.setTextViewText(R.id.day_eyebrow, origin.isEmpty() ? place : place + " · " + origin);
        tint(ctx, views, R.id.day_eyebrow, "setTextColor", accent);
        views.setTextViewText(R.id.day_card_title, card.optString("title"));
        int done = card.optInt("done");
        int total = card.optInt("total");
        boolean open = total > 0 && done < total && !card.isNull("next");
        views.setViewVisibility(R.id.day_next_dot, open ? View.VISIBLE : View.GONE);
        views.setTextViewText(R.id.day_next, open ? card.optString("next") + " · " + (done + 1) + " of " + total
            : total == 0 ? "No steps" : "All steps done");
        views.setOnClickPendingIntent(R.id.day_card, openTarget(ctx, "task", card.optString("id")));
    }

    private static void emptyCard(Context ctx, RemoteViews views, String text) {
        views.setViewVisibility(R.id.day_due, View.GONE);
        views.setTextViewText(R.id.day_eyebrow, "");
        views.setTextViewText(R.id.day_card_title, text);
        views.setViewVisibility(R.id.day_next_dot, View.GONE);
        views.setTextViewText(R.id.day_next, "Open YouDO to plan");
        views.setViewVisibility(R.id.day_nav, View.GONE);
        views.setViewVisibility(R.id.day_play, View.GONE);
        views.setOnClickPendingIntent(R.id.day_card, openApp(ctx));
    }

    /** Goal: the gauge, days left, and the honest pace (goalPace.ts) next to the pace you keep. */
    private static JSONObject goalView(Context ctx, RemoteViews views, int widgetId, JSONObject snapshot, JSONArray goals,
                                       ArcPainter.Palette palette, int[] arc) {
        int n = goals.length();
        int index = clamp(HomeWidgetStore.index(ctx, widgetId), n);
        JSONObject goal = goals.optJSONObject(index);
        if (goal == null) goal = new JSONObject();
        int pct = Math.max(0, Math.min(100, goal.optInt("pct")));
        String title = goal.optString("title");
        views.setImageViewBitmap(R.id.day_arc, ArcPainter.gauge(arc[0], arc[1], pct / 100f, palette));
        views.setTextViewText(R.id.day_title, "GOAL · " + (index + 1) + " OF " + n);
        color(ctx, views, R.id.day_title, "setTextColor", R.color.widget_text2);

        views.setViewVisibility(R.id.day_big, View.VISIBLE);
        views.setViewVisibility(R.id.day_timer, View.GONE);
        color(ctx, views, R.id.day_big, "setTextColor", R.color.widget_text);
        Calendar deadline = goal.isNull("deadline") ? null : localDate(goal.optString("deadline"));
        if (deadline != null) {
            long days = daysFromToday(deadline);
            views.setTextViewText(R.id.day_big, bold(String.valueOf(Math.abs(days))));
            views.setTextViewText(R.id.day_sub, (days < 0 ? (days == -1 ? "day overdue" : "days overdue") : days == 1 ? "day left" : "days left") + " · " + title);
        } else {
            views.setTextViewText(R.id.day_big, bold(pct + "%"));
            views.setTextViewText(R.id.day_sub, title + " · no deadline");
        }

        // The pace for what is planned: the dated stage in progress, else the goal as planned so far.
        Calendar paceEnd = goal.isNull("paceEnd") ? null : localDate(goal.optString("paceEnd"));
        int paceOpen = goal.optInt("paceOpen");
        String stage = goal.isNull("stage") ? null : goal.optString("stage");
        if (paceEnd == null) {
            views.setTextViewText(R.id.day_stat1, "—");
            views.setTextViewText(R.id.day_stat1_label, "NO DEADLINE TO PACE");
        } else {
            long daysLeft = Math.max(1, daysFromToday(paceEnd));
            views.setTextViewText(R.id.day_stat1, paceOpen == 0 ? "0" : rate(paceOpen / (double) daysLeft));
            views.setTextViewText(R.id.day_stat1_label, stage != null
                ? "A DAY · " + stage.toUpperCase(Locale.getDefault()) + " · " + daysLeft + "D"
                : "A DAY · AS PLANNED SO FAR");
        }
        views.setTextViewText(R.id.day_stat2, rate(goal.optInt("recent") / 7.0));
        views.setTextViewText(R.id.day_stat2_label, "YOUR PACE · 7 DAYS");
        JSONObject focus = snapshot == null ? null : snapshot.optJSONObject("focus");
        views.setTextViewText(R.id.day_stat3, duration(focus == null ? 0 : focus.optLong("avgMs")));
        views.setTextViewText(R.id.day_stat3_label, "AVG FOCUS · 30 DAYS");
        color(ctx, views, R.id.day_stat1, "setTextColor", R.color.widget_text);

        views.setViewVisibility(R.id.day_strip, View.GONE);
        views.setViewVisibility(R.id.day_stats, View.VISIBLE);
        views.setViewVisibility(R.id.day_goal_nav, n > 1 ? View.VISIBLE : View.GONE);
        views.setOnClickPendingIntent(R.id.day_goal_prev, dayAction(ctx, widgetId, "prev", null));
        views.setOnClickPendingIntent(R.id.day_goal_next, dayAction(ctx, widgetId, "next", null));
        PendingIntent openGoal = openTarget(ctx, "goal", goal.optString("id"));
        views.setOnClickPendingIntent(R.id.day_arc_area, openGoal);
        views.setOnClickPendingIntent(R.id.day_stats, openGoal);
        return goal;
    }

    /** Focusing: the timer in the arc's middle, its segment filling green with the task's steps. */
    private static JSONObject focusView(Context ctx, RemoteViews views, JSONObject snapshot, JSONObject session, JSONArray scheduled,
                                        JSONArray overdue, int done, int[] accent, ArcPainter.Palette palette, int[] arc) {
        boolean paused = session.optBoolean("isPaused", false);
        String taskId = session.optString("taskId");
        int inBacklog = indexOf(overdue, taskId);
        boolean backlog = inBacklog >= 0;
        JSONArray cards = backlog ? overdue : scheduled;
        int index = backlog ? inBacklog : indexOf(scheduled, taskId);
        JSONObject card = index >= 0 ? cards.optJSONObject(index) : null;
        int stepsDone = card == null ? 0 : card.optInt("done");
        int steps = card == null ? 0 : card.optInt("total");
        int[] segments = segments(backlog, backlog ? 0 : done, cards.length(), index);
        views.setImageViewBitmap(R.id.day_arc, ArcPainter.dayArc(arc[0], arc[1], segments,
            steps > 0 ? stepsDone / (float) steps : 0f, dayFraction(), palette));

        views.setTextViewText(R.id.day_title, paused ? "❚❚ PAUSED" : "● FOCUSING");
        if (paused) tint(ctx, views, R.id.day_title, "setTextColor", accent);
        else color(ctx, views, R.id.day_title, "setTextColor", R.color.widget_live);
        String since = session.optString("wallClockStart", "");
        if (!since.isEmpty()) {
            views.setTextViewText(R.id.day_badge, "since " + since);
            color(ctx, views, R.id.day_badge, "setTextColor", R.color.widget_text3);
        }

        long focused = SessionNotificationStore.elapsedFocusMs(session, paused);
        views.setViewVisibility(R.id.day_big, View.GONE);
        views.setViewVisibility(R.id.day_timer, View.VISIBLE);
        views.setChronometer(R.id.day_timer, SystemClock.elapsedRealtime() - focused, null, !paused);
        String title = SessionNotificationStore.title(ctx);
        views.setTextViewText(R.id.day_sub, title + (steps > 0 ? " · " + stepsDone + " of " + steps + " steps" : ""));

        // The strip: the step being worked on, with pause or resume and stop.
        String next = card == null || card.isNull("next") ? "" : card.optString("next");
        views.setViewVisibility(R.id.day_strip, View.VISIBLE);
        views.setViewVisibility(R.id.day_stats, View.GONE);
        views.setViewVisibility(R.id.day_due, View.GONE);
        views.setTextViewText(R.id.day_eyebrow, "NOW");
        color(ctx, views, R.id.day_eyebrow, "setTextColor", R.color.widget_live);
        views.setTextViewText(R.id.day_card_title, next.isEmpty() ? title : next);
        views.setViewVisibility(R.id.day_next_dot, View.GONE);
        views.setTextViewText(R.id.day_next, next.isEmpty() ? "since " + since : title);
        views.setViewVisibility(R.id.day_nav, View.GONE);
        views.setViewVisibility(R.id.day_play, View.GONE);
        views.setViewVisibility(R.id.day_pause, View.VISIBLE);
        views.setViewVisibility(R.id.day_stop, View.VISIBLE);
        views.setImageViewResource(R.id.day_pause, paused ? R.drawable.ic_widget_resume : R.drawable.ic_widget_pause);
        views.setContentDescription(R.id.day_pause, paused ? "Resume focus" : "Pause focus");
        views.setOnClickPendingIntent(R.id.day_pause, SessionNotificationStore.actionIntent(ctx,
            paused ? SessionNotificationStore.ACTION_RESUME : SessionNotificationStore.ACTION_PAUSE));
        views.setOnClickPendingIntent(R.id.day_stop, stopIntent(ctx, taskId));
        PendingIntent openTask = openTarget(ctx, "task", taskId);
        views.setOnClickPendingIntent(R.id.day_card, openTask);
        views.setOnClickPendingIntent(R.id.day_arc_area, openTask);
        return card;
    }

    /** The chips: Scheduled, Backlog and the goal of what is in front, the view shown filled in. */
    private static void chips(Context ctx, RemoteViews views, int widgetId, String tab, int done,
                              JSONArray scheduled, JSONArray overdue, JSONArray goals, JSONObject front) {
        views.setTextViewText(R.id.chip_scheduled, "Scheduled " + done + "/" + (done + scheduled.length()));
        views.setTextViewText(R.id.chip_backlog, overdue.length() == 0 ? "No backlog" : overdue.length() + " overdue");

        // The goal chip follows the card in front; in the goal view, the goal shown.
        JSONObject goal = null;
        if (front != null && front.has("pct")) goal = front;
        else if (front != null && !front.isNull("goal")) goal = HomeWidgetStore.find(snapshotOf(ctx), "goals", front.optString("goal"));
        if (goal == null) goal = goals.optJSONObject(0);
        views.setViewVisibility(R.id.chip_goal, goal == null ? View.GONE : View.VISIBLE);
        if (goal != null) {
            views.setTextViewText(R.id.chip_goal, goal.optString("title") + " · " + goal.optInt("pct") + "%");
            views.setOnClickPendingIntent(R.id.chip_goal, dayAction(ctx, widgetId, TAB_GOAL, goal.optString("id")));
        }

        boolean onScheduled = TAB_SCHEDULED.equals(tab);
        boolean onBacklog = TAB_BACKLOG.equals(tab);
        boolean onGoal = TAB_GOAL.equals(tab);
        views.setInt(R.id.chip_scheduled, "setBackgroundResource", onScheduled ? R.drawable.widget_chip_on : R.drawable.widget_box_bg);
        color(ctx, views, R.id.chip_scheduled, "setTextColor", onScheduled ? R.color.widget_tab_on_text : R.color.widget_text2);
        views.setInt(R.id.chip_backlog, "setBackgroundResource", onBacklog ? R.drawable.widget_chip_late : R.drawable.widget_box_bg);
        if (onBacklog) views.setTextColor(R.id.chip_backlog, Color.WHITE);
        else color(ctx, views, R.id.chip_backlog, "setTextColor", overdue.length() > 0 ? R.color.widget_overdue : R.color.widget_text2);
        views.setInt(R.id.chip_goal, "setBackgroundResource", onGoal ? R.drawable.widget_chip_on : R.drawable.widget_box_bg);
        color(ctx, views, R.id.chip_goal, "setTextColor", onGoal ? R.color.widget_tab_on_text : R.color.widget_text2);
        views.setOnClickPendingIntent(R.id.chip_scheduled, dayAction(ctx, widgetId, TAB_SCHEDULED, null));
        views.setOnClickPendingIntent(R.id.chip_backlog, dayAction(ctx, widgetId, TAB_BACKLOG, null));
    }

    private static JSONObject snapshotOf(Context ctx) {
        return HomeWidgetStore.snapshot(ctx);
    }

    /** ‹ or ›: the next or previous card or goal, looping round at either end. */
    static void step(Context ctx, int widgetId, boolean forward) {
        if (SessionNotificationStore.sessionObject(ctx) != null) return;
        String tab = HomeWidgetStore.tab(ctx, widgetId);
        JSONObject snapshot = HomeWidgetStore.snapshot(ctx);
        int count = list(snapshot, TAB_GOAL.equals(tab) ? "goals" : TAB_BACKLOG.equals(tab) ? "backlog" : "today").length();
        if (count < 2) return;
        int current = clamp(HomeWidgetStore.index(ctx, widgetId), count);
        HomeWidgetStore.setPlace(ctx, widgetId, tab, Math.floorMod(current + (forward ? 1 : -1), count));
        render(ctx, AppWidgetManager.getInstance(ctx), UpNextWidget.class, widgetId);
    }

    /** A goal chip: the goal view, on that goal. */
    static void showGoal(Context ctx, int widgetId, String goalId) {
        JSONArray goals = list(HomeWidgetStore.snapshot(ctx), "goals");
        HomeWidgetStore.setPlace(ctx, widgetId, TAB_GOAL, Math.max(0, indexOf(goals, goalId)));
        render(ctx, AppWidgetManager.getInstance(ctx), UpNextWidget.class, widgetId);
    }

    /** How far through the waking day it is, 6:00 to midnight, for the sun on the arc. */
    private static float dayFraction() {
        Calendar now = Calendar.getInstance();
        int minutes = now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE) - 6 * 60;
        return Math.max(0f, Math.min(1f, minutes / (18f * 60)));
    }

    private static SpannableStringBuilder bold(String text) {
        SpannableStringBuilder out = new SpannableStringBuilder(text);
        out.setSpan(new StyleSpan(Typeface.BOLD), 0, text.length(), 0);
        return out;
    }

    /** "1h 40m", "40m" or "0m". */
    private static String duration(long ms) {
        long minutes = Math.max(0, ms) / 60_000;
        return minutes >= 60 ? minutes / 60 + "h " + String.format(Locale.US, "%02d", minutes % 60) + "m" : minutes + "m";
    }

    /** "14h", or "40m" in the last hour. */
    private static String timeLeft(long ms) {
        long minutes = ms / 60_000;
        return minutes >= 60 ? minutes / 60 + "h" : Math.max(1, minutes) + "m";
    }

    /** A per-day rate: "12", "3.5" or "0.2". */
    private static String rate(double perDay) {
        if (perDay <= 0) return "0";
        if (perDay >= 10) return String.valueOf(Math.round(perDay));
        String text = String.format(Locale.US, "%.1f", Math.max(0.1, perDay));
        return text.endsWith(".0") ? text.substring(0, text.length() - 2) : text;
    }

    private static int clamp(int index, int count) {
        return count == 0 ? 0 : Math.max(0, Math.min(index, count - 1));
    }

    private static int indexOf(JSONArray items, String id) {
        if (id == null) return -1;
        for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.optJSONObject(i);
            if (item != null && id.equals(item.optString("id"))) return i;
        }
        return -1;
    }

    private static JSONArray list(JSONObject snapshot, String key) {
        JSONArray items = snapshot == null ? null : snapshot.optJSONArray(key);
        return items != null ? items : new JSONArray();
    }

    /** A Scheduled or Backlog card by task id. */
    static JSONObject findTask(JSONObject snapshot, String taskId) {
        JSONObject card = HomeWidgetStore.find(snapshot, "today", taskId);
        return card != null ? card : HomeWidgetStore.find(snapshot, "backlog", taskId);
    }

    private static long daysFromToday(Calendar day) {
        return Math.round((day.getTimeInMillis() - startOfToday().getTimeInMillis()) / 86_400_000.0);
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
            boolean noRooms = rooms == null || rooms.length() == 0;
            views.setTextViewText(R.id.room_message, rooms == null ? "Open YouDO to load your rooms"
                : rooms.length() == 0 ? "No rooms yet · create one in YouDO"
                : roomId == null ? "Tap to choose a room" : "Room left · tap to choose");
            views.setViewVisibility(R.id.room_content, View.GONE);
            views.setViewVisibility(R.id.room_canvas, View.GONE);
            views.setViewVisibility(R.id.room_message, View.VISIBLE);
            views.setOnClickPendingIntent(R.id.widget_root, noRooms ? openApp(ctx) : configure(ctx, widgetId));
            return views;
        }

        views.setViewVisibility(R.id.room_message, View.GONE);
        views.setViewVisibility(R.id.room_content, View.VISIBLE);
        views.setViewVisibility(R.id.room_canvas, View.VISIBLE);
        int[] accent = accent(snapshot);
        double barHours = room.optDouble("barHours", 4);
        long barMs = Math.round(barHours * 3_600_000);
        String bar = (barHours == Math.rint(barHours) ? String.valueOf((long) barHours) : String.valueOf(barHours)) + "h";
        views.setTextViewText(R.id.room_icon, room.optString("icon", "🔥"));
        views.setTextViewText(R.id.room_name, room.optString("name"));
        views.setTextViewText(R.id.room_bar, bar + " a day");

        JSONArray members = room.optJSONArray("members");
        long now = System.currentTimeMillis();
        boolean[] live = new boolean[SLOT.length];
        boolean[] seated = new boolean[SLOT.length];
        int liveCount = 0;
        int people = 0;
        int hitBar = 0;
        long together = 0;
        for (int i = 0; i < SLOT.length; i++) {
            JSONObject member = members == null ? null : members.optJSONObject(i);
            if (member == null) {
                // A free seat asks for a friend.
                views.setViewVisibility(RING[i], View.GONE);
                views.setImageViewResource(AVATAR[i], R.drawable.widget_invite);
                views.setInt(AVATAR[i], "setColorFilter", 0);
                views.setTextViewText(INITIAL[i], "+");
                color(ctx, views, INITIAL[i], "setTextColor", R.color.widget_text3);
                views.setTextViewText(MEMBER[i], "Invite");
                color(ctx, views, MEMBER[i], "setTextColor", R.color.widget_text3);
                views.setViewVisibility(TIME[i], View.GONE);
                views.setViewVisibility(AWAY[i], View.VISIBLE);
                views.setTextViewText(AWAY[i], "a friend");
                continue;
            }
            people++;
            seated[i] = true;
            String state = member.optString("state", "idle");
            long startedAt = member.isNull("startedAt") ? 0 : member.optLong("startedAt");
            boolean inSession = !"idle".equals(state) && startedAt > 0 && now - startedAt < LIVE_MAX_MS;
            boolean paused = "paused".equals(state);
            long todayMs = Math.max(0, member.optLong("todayMs"));
            together += todayMs;
            if (barMs > 0 && todayMs >= barMs) hitBar++;
            int tone = parseColor(member.optString("color"), 0xFF8A68C8);

            views.setImageViewResource(AVATAR[i], R.drawable.widget_avatar);
            views.setInt(AVATAR[i], "setColorFilter", inSession ? tone : ColorUtils.blendARGB(tone, 0xFF8E8E93, 0.55f));
            views.setTextViewText(INITIAL[i], member.optString("initial", "?"));
            views.setTextColor(INITIAL[i], Color.WHITE);
            views.setTextViewText(MEMBER[i], member.optString("name", member.optString("initial", "?")));
            color(ctx, views, MEMBER[i], "setTextColor", R.color.widget_text);
            // The ring: today's focus against the room's bar.
            views.setViewVisibility(RING[i], View.VISIBLE);
            views.setProgressBar(RING[i], 100, barMs > 0 ? (int) Math.min(100, todayMs * 100 / barMs) : 0, false);
            tintProgress(views, RING[i], inSession ? LIVE : accent);
            views.setViewVisibility(TIME[i], inSession ? View.VISIBLE : View.GONE);
            views.setViewVisibility(AWAY[i], inSession ? View.GONE : View.VISIBLE);
            if (inSession) {
                live[i] = true;
                liveCount++;
                // While paused the clock stops where the pause began (its last update).
                long end = paused ? Math.max(startedAt, member.optLong("updatedAt", now)) : now;
                long focused = Math.max(0, end - startedAt - Math.max(0, member.optLong("pausedMs")));
                views.setChronometer(TIME[i], SystemClock.elapsedRealtime() - focused, "● %s", !paused);
            } else {
                views.setTextViewText(AWAY[i], todayMs > 0 ? duration(todayMs) + " / " + bar : "away");
            }
        }
        views.setTextViewText(R.id.room_live, liveCount == 0 ? "nobody focusing" : "● " + liveCount + " focusing");
        color(ctx, views, R.id.room_live, "setTextColor", liveCount == 0 ? R.color.widget_text3 : R.color.widget_live);
        views.setTextViewText(R.id.room_together, together > 0 ? "together " + duration(together) + " today" : "no focus yet today");
        views.setTextViewText(R.id.room_hit, people == 0 ? "" : hitBar + " of " + people + " hit the bar");

        // The lines, from just past each seat's name to the room in the middle.
        int[] size = size(ctx, widgetId, 330, 170);
        float topY = 14 + 14 + 4 + 24;
        float bottomY = size[1] - 12 - 14 - 4 - 24;
        float leftX = 16 + 48 + 7 + 62 + 4;
        float rightX = size[0] - leftX;
        float[][] seats = {
            seated[0] ? new float[] { leftX, topY } : null,
            seated[1] ? new float[] { rightX, topY } : null,
            seated[2] ? new float[] { leftX, bottomY } : null,
            seated[3] ? new float[] { rightX, bottomY } : null,
        };
        float[] centre = { size[0] / 2f, size[1] / 2f - 17 };
        views.setImageViewBitmap(R.id.room_canvas, ArcPainter.roomLines(size[0], size[1], seats, live, centre, palette(ctx, accent)));
        views.setOnClickPendingIntent(R.id.widget_root, openTarget(ctx, "room", roomId));
        return views;
    }

    private static int parseColor(String hex, int fallback) {
        try {
            return Color.parseColor(hex);
        } catch (Exception e) {
            return fallback;
        }
    }

    /* ---------- intents ---------- */

    private static int immutable() {
        return PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
    }

    /** A tap on Day Arc, back to UpNextWidget. Each chip, arrow and card gets its own. */
    private static PendingIntent dayAction(Context ctx, int widgetId, String action, String id) {
        Intent intent = new Intent(ctx, UpNextWidget.class).setAction(ACTION_CARD);
        intent.setData(Uri.parse("youdo-widget://day/" + widgetId + "/" + action + (id == null ? "" : "/" + Uri.encode(id))));
        intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
        intent.putExtra(EXTRA_ACTION, action);
        if (id != null) intent.putExtra(EXTRA_TASK, id);
        return PendingIntent.getBroadcast(ctx, 36100 + widgetId, intent, immutable());
    }

    static PendingIntent openApp(Context ctx) {
        Intent intent = new Intent(ctx, YouDoActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(ctx, 36001, intent, immutable());
    }

    /** Opens YouDO on a task, goal or room (YouDoActivity hands it to the app). */
    private static PendingIntent openTarget(Context ctx, String kind, String id) {
        if (id == null || id.isEmpty()) return openApp(ctx);
        Intent intent = new Intent(ctx, YouDoActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        // Its own data, so each target keeps its own PendingIntent.
        intent.setData(Uri.parse("youdo-widget://open/" + kind + "/" + Uri.encode(id)));
        intent.putExtra(EXTRA_OPEN, kind + ":" + id);
        return PendingIntent.getActivity(ctx, 36003, intent, immutable());
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
