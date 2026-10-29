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
import android.os.SystemClock;
import android.text.SpannableStringBuilder;
import android.text.style.ForegroundColorSpan;
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

/** Draws the Up next, Progress and Room widgets from HomeWidgetStore and the live session. */
final class HomeWidgets {
    static final String ACTION_CARD = "com.mattedhairr.youdo.WIDGET_CARD";
    static final String EXTRA_ACTION = "widget_action";
    static final String EXTRA_TASK = "widget_task";
    static final String EXTRA_STOP_TASK = "youdo_widget_stop";
    /** Where a tap should land in the app: "task:<id>", "goal:<id>" or "room:<id>". */
    static final String EXTRA_OPEN = "youdo_widget_open";
    /** Up next's tabs, as in Today. */
    static final String TAB_SCHEDULED = "scheduled";
    static final String TAB_BACKLOG = "backlog";

    /** A room-mate's dot goes out after this, in case the push that ended it was missed. */
    private static final long LIVE_MAX_MS = 4 * 60 * 60 * 1000L;
    /** YouDO's sand {light, dark}, until the app has sent its accent. */
    private static final int[] DEFAULT_ACCENT = { 0xFF8C6A3A, 0xFFC9A46E };

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
        refresh(ctx, ProgressWidget.class);
        refresh(ctx, RoomWidget.class);
    }

    static void refresh(Context ctx, Class<?> provider) {
        AppWidgetManager manager = AppWidgetManager.getInstance(ctx);
        int[] ids = manager.getAppWidgetIds(new ComponentName(ctx, provider));
        if (ids == null || ids.length == 0) return;
        for (int id : ids) render(ctx, manager, provider, id);
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

    /** Progress bars take a tint on Android 12+ only; older phones keep the drawable's colour. */
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

    /* ---------- Up next ---------- */

    private static RemoteViews upNext(Context ctx, int widgetId) {
        JSONObject snapshot = HomeWidgetStore.snapshot(ctx);
        JSONObject session = SessionNotificationStore.sessionObject(ctx);
        if (session != null) return sessionViews(ctx, snapshot, session);

        RemoteViews views = new RemoteViews(ctx.getPackageName(), R.layout.widget_up_next);
        boolean backlog = TAB_BACKLOG.equals(HomeWidgetStore.tab(ctx, widgetId));
        JSONArray scheduled = list(snapshot, "today");
        JSONArray overdue = list(snapshot, "backlog");
        JSONArray cards = backlog ? overdue : scheduled;
        int count = cards.length();
        int index = Math.max(0, Math.min(HomeWidgetStore.index(ctx, widgetId), count - 1));
        tabs(ctx, views, widgetId, backlog, scheduled.length(), overdue.length());

        // Every card sits in the flipper; ‹ › show another (step), which slides in.
        int[] accent = accent(snapshot);
        views.removeAllViews(R.id.widget_flipper);
        for (int i = 0; i < count; i++) views.addView(R.id.widget_flipper, card(ctx, widgetId, cards.optJSONObject(i), accent));
        if (count > 0) views.setDisplayedChild(R.id.widget_flipper, index);
        views.setViewVisibility(R.id.widget_flipper, count == 0 ? View.GONE : View.VISIBLE);
        views.setViewVisibility(R.id.widget_empty, count == 0 ? View.VISIBLE : View.GONE);
        views.setTextViewText(R.id.widget_empty, snapshot == null ? "Open YouDO once to fill this widget."
            : backlog ? "Nothing overdue. Keep the streak." : "Nothing scheduled for today.");
        views.setOnClickPendingIntent(R.id.widget_empty, openApp(ctx));

        views.setTextViewText(R.id.nav_pos, count == 0 ? "" : (index + 1) + " / " + count);
        views.setViewVisibility(R.id.nav_prev, count > 1 ? View.VISIBLE : View.INVISIBLE);
        views.setViewVisibility(R.id.nav_next, count > 1 ? View.VISIBLE : View.INVISIBLE);
        views.setOnClickPendingIntent(R.id.nav_prev, upNextAction(ctx, widgetId, "prev", null));
        views.setOnClickPendingIntent(R.id.nav_next, upNextAction(ctx, widgetId, "next", null));
        return views;
    }

    /** ‹ or ›: the next or previous card slides in, looping round at either end. */
    static void step(Context ctx, int widgetId, boolean forward) {
        if (SessionNotificationStore.sessionObject(ctx) != null) return;
        String tab = HomeWidgetStore.tab(ctx, widgetId);
        int count = list(HomeWidgetStore.snapshot(ctx), TAB_BACKLOG.equals(tab) ? "backlog" : "today").length();
        if (count < 2) return;
        int current = Math.max(0, Math.min(HomeWidgetStore.index(ctx, widgetId), count - 1));
        int index = Math.floorMod(current + (forward ? 1 : -1), count);
        HomeWidgetStore.setPlace(ctx, widgetId, tab, index);
        RemoteViews views = new RemoteViews(ctx.getPackageName(), R.layout.widget_up_next);
        views.setDisplayedChild(R.id.widget_flipper, index);
        views.setTextViewText(R.id.nav_pos, (index + 1) + " / " + count);
        AppWidgetManager.getInstance(ctx).partiallyUpdateAppWidget(widgetId, views);
    }

    private static void tabs(Context ctx, RemoteViews views, int widgetId, boolean backlog, int scheduled, int overdue) {
        views.setTextViewText(R.id.tab_scheduled, tabLabel(ctx, "Scheduled", scheduled, false));
        views.setTextViewText(R.id.tab_backlog, tabLabel(ctx, "Backlog", overdue, true));
        views.setInt(R.id.tab_scheduled, "setBackgroundResource", backlog ? 0 : R.drawable.widget_tab_on);
        views.setInt(R.id.tab_backlog, "setBackgroundResource", backlog ? R.drawable.widget_tab_on : 0);
        color(ctx, views, R.id.tab_scheduled, "setTextColor", backlog ? R.color.widget_text2 : R.color.widget_tab_on_text);
        color(ctx, views, R.id.tab_backlog, "setTextColor", backlog ? R.color.widget_tab_on_text : R.color.widget_text2);
        views.setOnClickPendingIntent(R.id.tab_scheduled, upNextAction(ctx, widgetId, TAB_SCHEDULED, null));
        views.setOnClickPendingIntent(R.id.tab_backlog, upNextAction(ctx, widgetId, TAB_BACKLOG, null));
    }

    /** "Scheduled  2"; the backlog count is red, as in Today. */
    private static CharSequence tabLabel(Context ctx, String name, int count, boolean overdue) {
        SpannableStringBuilder text = new SpannableStringBuilder(name);
        if (count == 0) return text;
        int start = text.length() + 2;
        text.append("  ").append(String.valueOf(count));
        if (overdue) text.setSpan(new ForegroundColorSpan(ContextCompat.getColor(ctx, R.color.widget_overdue)), start, text.length(), 0);
        return text;
    }

    private static RemoteViews card(Context ctx, int widgetId, JSONObject card, int[] accent) {
        RemoteViews views = new RemoteViews(ctx.getPackageName(), R.layout.widget_up_next_card);
        if (card == null) return views;
        int done = card.optInt("done");
        int total = card.optInt("total");
        views.setTextViewText(R.id.card_title, card.optString("title"));
        // As on Today's cards: two goal levels in a chip, or "Quick task".
        boolean quick = card.isNull("origin");
        String origin = quick ? "" : card.optString("origin");
        views.setViewVisibility(R.id.card_quick, quick ? View.VISIBLE : View.GONE);
        views.setViewVisibility(R.id.card_origin, origin.isEmpty() ? View.GONE : View.VISIBLE);
        views.setTextViewText(R.id.card_origin_text, origin);
        tint(ctx, views, R.id.card_origin_text, "setTextColor", accent);
        tint(ctx, views, R.id.card_origin_icon, "setColorFilter", accent);
        CharSequence path = cardPath(ctx, card);
        views.setTextViewText(R.id.card_path, path);
        views.setViewVisibility(R.id.card_path, path.length() == 0 ? View.GONE : View.VISIBLE);
        views.setTextViewText(R.id.card_steps, total > 0 ? done + " of " + total + " steps" : "No steps");
        views.setProgressBar(R.id.card_bar, 100, total > 0 ? Math.min(100, done * 100 / total) : 0, false);
        tint(ctx, views, R.id.card_start_bg, "setColorFilter", accent);
        tintProgress(views, R.id.card_bar, accent);
        views.setOnClickPendingIntent(R.id.card_start, upNextAction(ctx, widgetId, "start", card.optString("id")));
        views.setOnClickPendingIntent(R.id.card_root, openTarget(ctx, "task", card.optString("id")));
        return views;
    }

    /** The rest of the goal path under the title; a backlog card leads with the day it was due, in red. */
    private static CharSequence cardPath(Context ctx, JSONObject card) {
        String path = card.optString("context");
        Calendar due = card.isNull("due") ? null : localDate(card.optString("due"));
        if (due == null) return path;
        SpannableStringBuilder text = new SpannableStringBuilder("Due " + new SimpleDateFormat("MMM d", Locale.getDefault()).format(due.getTime()));
        text.setSpan(new ForegroundColorSpan(ContextCompat.getColor(ctx, R.color.widget_overdue)), 0, text.length(), 0);
        text.setSpan(new StyleSpan(Typeface.BOLD), 0, text.length(), 0);
        if (!path.isEmpty()) text.append(" · ").append(path);
        return text;
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

    /** A tap on Up next, back to UpNextWidget. Each tab, arrow and card gets its own. */
    private static PendingIntent upNextAction(Context ctx, int widgetId, String action, String taskId) {
        Intent intent = new Intent(ctx, UpNextWidget.class).setAction(ACTION_CARD);
        intent.setData(Uri.parse("youdo-widget://up-next/" + widgetId + "/" + action + (taskId == null ? "" : "/" + Uri.encode(taskId))));
        intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
        intent.putExtra(EXTRA_ACTION, action);
        if (taskId != null) intent.putExtra(EXTRA_TASK, taskId);
        return PendingIntent.getBroadcast(ctx, 36100 + widgetId, intent, immutable());
    }

    private static RemoteViews sessionViews(Context ctx, JSONObject snapshot, JSONObject session) {
        RemoteViews views = new RemoteViews(ctx.getPackageName(), R.layout.widget_up_next_session);
        boolean paused = session.optBoolean("isPaused", false);
        String taskId = session.optString("taskId");
        JSONObject card = findTask(snapshot, taskId);
        int[] accent = accent(snapshot);

        long focused = SessionNotificationStore.elapsedFocusMs(session, paused);
        views.setChronometer(R.id.session_timer, SystemClock.elapsedRealtime() - focused, null, !paused);
        views.setTextViewText(R.id.session_state, paused ? "❚❚  PAUSED" : "●  FOCUSING");
        if (paused) tint(ctx, views, R.id.session_state, "setTextColor", accent);
        else color(ctx, views, R.id.session_state, "setTextColor", R.color.widget_live);
        views.setTextViewText(R.id.session_title, SessionNotificationStore.title(ctx));

        String since = session.optString("wallClockStart", "");
        String meta = since.isEmpty() ? "" : "since " + since;
        if (card != null) meta += (meta.isEmpty() ? "" : " · ") + (card.isNull("due") ? "#" + card.optInt("rank") + " today" : "from the backlog");
        views.setTextViewText(R.id.session_meta, meta);

        int done = card == null ? 0 : card.optInt("done");
        int total = card == null ? 0 : card.optInt("total");
        views.setProgressBar(R.id.session_ring, 100, total > 0 ? Math.min(100, done * 100 / total) : 0, false);
        tintProgress(views, R.id.session_ring, accent);
        views.setTextViewText(R.id.session_ring_label, total > 0 ? done + " of " + total + " steps" : "focus");

        views.setImageViewResource(R.id.session_toggle, paused ? R.drawable.ic_widget_resume : R.drawable.ic_widget_pause);
        views.setContentDescription(R.id.session_toggle, paused ? "Resume focus" : "Pause focus");
        views.setOnClickPendingIntent(R.id.session_toggle, SessionNotificationStore.actionIntent(ctx,
            paused ? SessionNotificationStore.ACTION_RESUME : SessionNotificationStore.ACTION_PAUSE));
        views.setOnClickPendingIntent(R.id.session_stop, stopIntent(ctx, taskId));
        views.setOnClickPendingIntent(R.id.widget_root, openTarget(ctx, "task", taskId));
        return views;
    }

    /* ---------- Progress ---------- */

    private static RemoteViews progress(Context ctx, int widgetId) {
        RemoteViews views = new RemoteViews(ctx.getPackageName(), R.layout.widget_progress);
        JSONObject snapshot = HomeWidgetStore.snapshot(ctx);
        streak(ctx, views, snapshot == null ? null : snapshot.optJSONObject("streak"));
        tint(ctx, views, R.id.progress_days, "setTextColor", accent(snapshot));

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
        views.setOnClickPendingIntent(R.id.widget_root, openTarget(ctx, "goal", goalId));
        return views;
    }

    /**
     * The streak, or a broken one that can still be restored: its old length in
     * amber with a faded flame and the time left ("SAVE · 14h"). The widget's
     * half-hourly update moves the countdown and drops it when the window ends.
     */
    private static void streak(Context ctx, RemoteViews views, JSONObject streak) {
        JSONObject save = streak == null ? null : streak.optJSONObject("save");
        long left = save == null ? 0 : save.optLong("endsAt") - System.currentTimeMillis();
        if (left > 0) {
            long minutes = left / 60_000;
            views.setTextViewText(R.id.progress_streak, String.valueOf(save.optInt("days")));
            views.setTextViewText(R.id.progress_streak_label, "SAVE · " + (minutes >= 60 ? minutes / 60 + "h" : Math.max(1, minutes) + "m"));
            color(ctx, views, R.id.progress_streak, "setTextColor", R.color.widget_save);
            color(ctx, views, R.id.progress_streak_label, "setTextColor", R.color.widget_save);
            views.setTextColor(R.id.progress_flame, 0x66FFFFFF);
            return;
        }
        views.setTextViewText(R.id.progress_streak, String.valueOf(streak == null ? 0 : streak.optInt("days")));
        views.setTextViewText(R.id.progress_streak_label, ctx.getString(R.string.widget_days));
        color(ctx, views, R.id.progress_streak, "setTextColor", R.color.widget_text);
        color(ctx, views, R.id.progress_streak_label, "setTextColor", R.color.widget_text2);
        views.setTextColor(R.id.progress_flame, 0xFFFFFFFF);
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
            views.setViewVisibility(R.id.room_message, View.VISIBLE);
            views.setOnClickPendingIntent(R.id.widget_root, noRooms ? openApp(ctx) : configure(ctx, widgetId));
            return views;
        }

        views.setViewVisibility(R.id.room_message, View.GONE);
        views.setViewVisibility(R.id.room_content, View.VISIBLE);
        views.setTextViewText(R.id.room_name, room.optString("name"));
        JSONArray members = room.optJSONArray("members");
        long now = System.currentTimeMillis();
        int live = 0;
        int shown = 0;
        for (int i = 0; i < SLOT.length; i++) {
            JSONObject member = members == null ? null : members.optJSONObject(i);
            if (member == null) {
                views.setViewVisibility(SLOT[i], View.GONE);
                continue;
            }
            shown++;
            views.setViewVisibility(SLOT[i], View.VISIBLE);
            String state = member.optString("state", "idle");
            long startedAt = member.isNull("startedAt") ? 0 : member.optLong("startedAt");
            boolean inSession = !"idle".equals(state) && startedAt > 0 && now - startedAt < LIVE_MAX_MS;
            boolean paused = "paused".equals(state);
            int color = parseColor(member.optString("color"), 0xFF8A68C8);

            views.setTextViewText(INITIAL[i], member.optString("initial", "?"));
            views.setTextViewText(MEMBER[i], member.optString("name", member.optString("initial", "?")));
            views.setInt(AVATAR[i], "setColorFilter", inSession ? color : ColorUtils.blendARGB(color, 0xFF8E8E93, 0.65f));
            views.setViewVisibility(RING[i], inSession ? View.VISIBLE : View.GONE);
            views.setViewVisibility(TIME[i], inSession ? View.VISIBLE : View.GONE);
            views.setViewVisibility(AWAY[i], inSession ? View.GONE : View.VISIBLE);
            if (inSession) {
                live++;
                // While paused the clock stops where the pause began (its last update).
                long end = paused ? Math.max(startedAt, member.optLong("updatedAt", now)) : now;
                long focused = Math.max(0, end - startedAt - Math.max(0, member.optLong("pausedMs")));
                views.setChronometer(TIME[i], SystemClock.elapsedRealtime() - focused, "● %s", !paused);
            }
        }
        // A room with space left asks for a friend in it.
        views.setViewVisibility(R.id.room_invite, shown < SLOT.length ? View.VISIBLE : View.GONE);
        views.setTextViewText(R.id.room_live, live == 0 ? "nobody focusing" : "●  " + live + " focusing");
        color(ctx, views, R.id.room_live, "setTextColor", live == 0 ? R.color.widget_text3 : R.color.widget_live);
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
