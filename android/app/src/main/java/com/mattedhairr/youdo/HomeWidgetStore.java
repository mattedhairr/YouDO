package com.mattedhairr.youdo;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;
import java.security.SecureRandom;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * What the home-screen widgets show (a snapshot from the app, see
 * src/lib/homeWidgets.ts) and the taps they queue for the app to apply.
 */
final class HomeWidgetStore {
    private static final String PREFS = "youdo_widgets";
    private static final String KEY_SNAPSHOT = "snapshot";
    private static final String KEY_ACTIONS = "actions";
    private static final String KEY_CHOICE = "choice_";
    private static final String KEY_TAB = "tab_";
    private static final String KEY_INDEX = "index_";
    private static final String KEY_WIDGET_KEY = "widget_key";
    private static final String KEY_WIDGET_USER = "widget_user";
    private static final String KEY_API_URL = "api_url";
    private static final String KEY_API_ANON = "api_anon";
    /** The phone session your Room seat last showed ("" for none): see HomeWidgets.showSelfInRooms. */
    private static final String KEY_SELF_SESSION = "self_session";
    private static final int MAX_ACTIONS = 100;

    private HomeWidgetStore() {}

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** What the widgets show: the app's last snapshot, moved on to today (rollOver). */
    static JSONObject snapshot(Context ctx) {
        return rollOver(stored(ctx), today());
    }

    /** The app's last snapshot as it was sent. */
    private static JSONObject stored(Context ctx) {
        String raw = prefs(ctx).getString(KEY_SNAPSHOT, null);
        if (raw == null) return null;
        try {
            return new JSONObject(raw);
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * The app's new snapshot. Rooms the app has not loaded keep the last ones,
     * and a member's focus state this phone heard of later (a push, or your own
     * session) is kept over the older one the app fetched.
     */
    static synchronized void saveSnapshot(Context ctx, String json) throws Exception {
        JSONObject incoming = new JSONObject(json);
        JSONObject current = stored(ctx);
        JSONArray known = current != null ? current.optJSONArray("rooms") : null;
        if (incoming.isNull("rooms")) {
            incoming.put("rooms", known != null ? known : new JSONArray());
        } else {
            keepNewerFocus(known, incoming.optJSONArray("rooms"));
        }
        // A session on this phone is always your seat, whatever the server said last.
        Map<String, String> mine = selfStatus(SessionNotificationStore.sessionObject(ctx));
        String self = selfId(ctx);
        if (mine != null && self != null) {
            mine.put("member", self);
            setMember(incoming.optJSONArray("rooms"), mine, true);
        }
        prefs(ctx).edit().putString(KEY_SNAPSHOT, incoming.toString()).apply();
    }

    private static void keepNewerFocus(JSONArray known, JSONArray rooms) throws Exception {
        if (known == null || rooms == null) return;
        java.util.HashMap<String, JSONObject> latest = new java.util.HashMap<>();
        for (int r = 0; r < known.length(); r++) {
            JSONArray members = known.getJSONObject(r).optJSONArray("members");
            for (int m = 0; members != null && m < members.length(); m++) {
                JSONObject person = members.getJSONObject(m);
                JSONObject seen = latest.get(person.optString("id"));
                if (seen == null || person.optLong("updatedAt") > seen.optLong("updatedAt")) latest.put(person.optString("id"), person);
            }
        }
        for (int r = 0; r < rooms.length(); r++) {
            JSONArray members = rooms.getJSONObject(r).optJSONArray("members");
            for (int m = 0; members != null && m < members.length(); m++) {
                JSONObject person = members.getJSONObject(m);
                JSONObject seen = latest.get(person.optString("id"));
                // Saved before seats were marked (no "local" field): the fresh fetch wins, so an
                // "away" an older version wrote with the phone's clock can't outlast the server.
                if (seen == null || !seen.has("local") || seen.optLong("updatedAt") <= person.optLong("updatedAt")) continue;
                person.put("state", seen.opt("state"));
                person.put("startedAt", seen.opt("startedAt"));
                person.put("pausedMs", seen.optLong("pausedMs"));
                person.put("updatedAt", seen.optLong("updatedAt"));
                person.put("local", seen.optBoolean("local", false));
            }
        }
    }

    /** The phone's local date, yyyy-mm-dd, as the app writes dates. */
    static String today() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
    }

    /**
     * Only the app writes the snapshot, so on a day it has not been opened yet
     * the snapshot is moved on here, as the app would: earlier days' open cards
     * turn overdue, the day's scheduled cards (sent ahead in "upcoming") become
     * today's, and today's focus starts again at zero. Snapshots without a date
     * (an older app) are shown as they are.
     */
    static JSONObject rollOver(JSONObject snapshot, String today) {
        String date = snapshot == null ? "" : snapshot.optString("date", "");
        if (date.isEmpty() || date.compareTo(today) >= 0) return snapshot;
        try {
            JSONArray backlog = list(snapshot, "backlog");
            JSONArray scheduled = new JSONArray();
            JSONArray upcoming = new JSONArray();
            JSONArray was = list(snapshot, "today");
            for (int i = 0; i < was.length(); i++) backlog.put(was.getJSONObject(i).put("due", date));
            // Sent by date, so the backlog stays oldest first.
            JSONArray ahead = list(snapshot, "upcoming");
            for (int i = 0; i < ahead.length(); i++) {
                JSONObject card = ahead.getJSONObject(i);
                int day = card.optString("due", "").compareTo(today);
                if (day < 0) backlog.put(card);
                else if (day == 0) scheduled.put(card.put("due", JSONObject.NULL));
                else upcoming.put(card);
            }
            snapshot.put("backlog", ranked(backlog)).put("today", ranked(scheduled)).put("upcoming", ranked(upcoming));
            snapshot.put("todayDone", 0);

            JSONObject focus = snapshot.optJSONObject("focus");
            if (focus != null) {
                long last = focus.optLong("todayMs");
                // The day just gone is now one of the 30 the best is taken from.
                if (last > 0 && last >= focus.optLong("bestMs") && daysBetween(date, today) <= 30) {
                    focus.put("bestMs", last).put("bestDate", date);
                }
                focus.put("todayMs", 0);
            }
            JSONArray rooms = snapshot.optJSONArray("rooms");
            for (int r = 0; rooms != null && r < rooms.length(); r++) {
                JSONArray members = rooms.getJSONObject(r).optJSONArray("members");
                // A session running now is still added to this by the widget.
                for (int m = 0; members != null && m < members.length(); m++) members.getJSONObject(m).put("todayMs", 0);
            }
            return snapshot.put("date", today);
        } catch (Exception e) {
            return snapshot;
        }
    }

    private static JSONArray list(JSONObject snapshot, String key) {
        JSONArray items = snapshot.optJSONArray(key);
        return items != null ? items : new JSONArray();
    }

    private static JSONArray ranked(JSONArray cards) throws Exception {
        for (int i = 0; i < cards.length(); i++) cards.getJSONObject(i).put("rank", i + 1);
        return cards;
    }

    /** Whole local days from one yyyy-mm-dd to another. */
    private static long daysBetween(String from, String to) {
        try {
            SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
            Calendar a = Calendar.getInstance();
            a.setTime(format.parse(from));
            Calendar b = Calendar.getInstance();
            b.setTime(format.parse(to));
            return Math.round((b.getTimeInMillis() - a.getTimeInMillis()) / 86_400_000.0);
        } catch (Exception e) {
            return Long.MAX_VALUE;
        }
    }

    static JSONObject find(JSONObject snapshot, String list, String id) {
        JSONArray items = snapshot == null ? null : snapshot.optJSONArray(list);
        if (items == null || id == null) return null;
        for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.optJSONObject(i);
            if (item != null && id.equals(item.optString("id"))) return item;
        }
        return null;
    }

    /** A widget tap that opened the app: it shows that task, goal or room ("kind:id"). */
    static synchronized void queueOpen(Context ctx, String target) {
        int colon = target == null ? -1 : target.indexOf(':');
        if (colon <= 0) return;
        try {
            JSONObject action = new JSONObject().put("type", "open").put("kind", target.substring(0, colon)).put("id", target.substring(colon + 1));
            prefs(ctx).edit().putString(KEY_ACTIONS, queued(ctx, action).toString()).commit();
        } catch (Exception ignored) {
            /* the app opens where it was */
        }
    }

    /** Stop on the widget opens the app, which then shows the stop sheet. */
    static synchronized void queueStop(Context ctx, String taskId) {
        try {
            JSONObject action = new JSONObject().put("type", "stop").put("taskId", taskId);
            prefs(ctx).edit().putString(KEY_ACTIONS, queued(ctx, action).toString()).commit();
        } catch (Exception ignored) {
            /* the app still opens on the running session */
        }
    }

    static synchronized JSONArray takeActions(Context ctx) {
        JSONArray queue = actions(ctx);
        prefs(ctx).edit().remove(KEY_ACTIONS).commit();
        return queue;
    }

    private static JSONArray actions(Context ctx) {
        try {
            return new JSONArray(prefs(ctx).getString(KEY_ACTIONS, "[]"));
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    private static JSONArray queued(Context ctx, JSONObject action) {
        JSONArray queue = actions(ctx);
        queue.put(action);
        if (queue.length() <= MAX_ACTIONS) return queue;
        JSONArray trimmed = new JSONArray();
        for (int i = queue.length() - MAX_ACTIONS; i < queue.length(); i++) trimmed.put(queue.opt(i));
        return trimmed;
    }

    /**
     * Someone in your rooms started, paused, resumed or stopped (silent push,
     * see hub_widget_push.sql). That includes you, from another device such as
     * the website, so your seat follows a session wherever it runs. A session on
     * this phone is never overridden by news about you from elsewhere.
     */
    static synchronized boolean applyFocusStatus(Context ctx, Map<String, String> data) {
        String member = data.get("member");
        if (member != null && member.equals(selfId(ctx)) && SessionNotificationStore.sessionObject(ctx) != null) return false;
        return apply(ctx, data, false);
    }

    /** Your seat from this phone's own session (start, pause, resume or its end): see HomeWidgets.showSelfInRooms. */
    static synchronized boolean applySelfStatus(Context ctx, Map<String, String> data) {
        return apply(ctx, data, true);
    }

    private static boolean apply(Context ctx, Map<String, String> data, boolean force) {
        JSONObject snapshot = stored(ctx);
        if (snapshot == null || data.get("member") == null || data.get("state") == null) return false;
        boolean changed = setMember(snapshot.optJSONArray("rooms"), data, force);
        if (changed) prefs(ctx).edit().putString(KEY_SNAPSHOT, snapshot.toString()).apply();
        return changed;
    }

    /**
     * Writes one member's state into every room they share. From the server
     * (force false), an older update never wins, but it always replaces a seat
     * this phone wrote itself (marked local), whatever the two clocks say. This
     * phone's own writes (force true) are provisional until the server's arrive.
     */
    private static boolean setMember(JSONArray rooms, Map<String, String> data, boolean force) {
        String member = data.get("member");
        String state = data.get("state");
        if (member == null || state == null) return false;
        long updatedAt = parseLong(data.get("updated_at"));
        long startedAt = parseLong(data.get("started_at"));
        boolean changed = false;
        try {
            for (int r = 0; rooms != null && r < rooms.length(); r++) {
                JSONArray members = rooms.getJSONObject(r).optJSONArray("members");
                for (int m = 0; members != null && m < members.length(); m++) {
                    JSONObject person = members.getJSONObject(m);
                    // Pushes can arrive out of order; an older one never wins.
                    if (!member.equals(person.optString("id"))) continue;
                    if (!force && !person.optBoolean("local", false) && person.optLong("updatedAt") > updatedAt) continue;
                    person.put("state", state);
                    person.put("startedAt", startedAt > 0 ? startedAt : JSONObject.NULL);
                    person.put("pausedMs", Math.max(0, parseLong(data.get("paused_ms"))));
                    person.put("updatedAt", updatedAt);
                    person.put("local", force);
                    changed = true;
                }
            }
        } catch (Exception e) {
            return false;
        }
        return changed;
    }

    /**
     * Your seat as this phone's session shows it, in the push's terms, or null
     * with no session. A paused seat's time is the moment the pause began, which
     * is how the widget reads it (HomeWidgets.room).
     */
    static Map<String, String> selfStatus(JSONObject session) {
        if (session == null) return null;
        boolean paused = session.optBoolean("isPaused", false);
        long now = System.currentTimeMillis();
        Map<String, String> status = new java.util.HashMap<>();
        status.put("state", paused ? "paused" : "focusing");
        status.put("started_at", String.valueOf(session.optLong("startTime")));
        status.put("paused_ms", String.valueOf(Math.max(0, session.optLong("pausedDuration"))));
        status.put("updated_at", String.valueOf(paused ? session.optLong("pauseStart", now) : now));
        return status;
    }

    /** The phone session your seat last showed, "" for none. */
    static String selfSessionKey(Context ctx) {
        return prefs(ctx).getString(KEY_SELF_SESSION, "");
    }

    static void setSelfSessionKey(Context ctx, String key) {
        prefs(ctx).edit().putString(KEY_SELF_SESSION, key).apply();
    }

    private static long parseLong(String value) {
        try {
            return value == null || value.isEmpty() ? 0 : Long.parseLong(value);
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    /**
     * This phone's widget key for the signed-in account: kept for the same
     * account, replaced for another, dropped when signed out. Returns
     * {key, previousKey}; the app registers the one and forgets the other.
     */
    static synchronized String[] widgetKey(Context ctx, String userId, String url, String anonKey) {
        SharedPreferences prefs = prefs(ctx);
        String key = prefs.getString(KEY_WIDGET_KEY, null);
        String owner = prefs.getString(KEY_WIDGET_USER, null);
        SharedPreferences.Editor editor = prefs.edit();
        if (url != null && anonKey != null) editor.putString(KEY_API_URL, url).putString(KEY_API_ANON, anonKey);
        String previous = null;
        if (key != null && (userId == null || !userId.equals(owner))) {
            previous = key;
            key = null;
            editor.remove(KEY_WIDGET_KEY).remove(KEY_WIDGET_USER);
        }
        if (userId != null && key == null) {
            byte[] bytes = new byte[32];
            new SecureRandom().nextBytes(bytes);
            key = Base64.encodeToString(bytes, Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP);
            editor.putString(KEY_WIDGET_KEY, key).putString(KEY_WIDGET_USER, userId);
        }
        editor.commit();
        return new String[] { key, previous };
    }

    /** The signed-in account the widgets are for (set with its widget key), or null. */
    static String selfId(Context ctx) {
        return prefs(ctx).getString(KEY_WIDGET_USER, null);
    }

    /** {url, anonKey, widgetKey} for FocusStatusPoster, or null when signed out. */
    static String[] api(Context ctx) {
        SharedPreferences prefs = prefs(ctx);
        String url = prefs.getString(KEY_API_URL, null);
        String anon = prefs.getString(KEY_API_ANON, null);
        String key = prefs.getString(KEY_WIDGET_KEY, null);
        return url == null || anon == null || key == null ? null : new String[] { url, anon, key };
    }

    /** The goal (Progress) or room (Room) a widget shows. */
    static String choice(Context ctx, int widgetId) {
        return prefs(ctx).getString(KEY_CHOICE + widgetId, null);
    }

    static void setChoice(Context ctx, int widgetId, String id) {
        prefs(ctx).edit().putString(KEY_CHOICE + widgetId, id).commit();
    }

    /** Up next: which tab ("scheduled" or "backlog") and card a widget is on. */
    static String tab(Context ctx, int widgetId) {
        return prefs(ctx).getString(KEY_TAB + widgetId, "scheduled");
    }

    static int index(Context ctx, int widgetId) {
        return prefs(ctx).getInt(KEY_INDEX + widgetId, 0);
    }

    static void setPlace(Context ctx, int widgetId, String tab, int index) {
        prefs(ctx).edit().putString(KEY_TAB + widgetId, tab).putInt(KEY_INDEX + widgetId, index).commit();
    }

    static void forget(Context ctx, int[] widgetIds) {
        SharedPreferences.Editor editor = prefs(ctx).edit();
        for (int id : widgetIds) editor.remove(KEY_CHOICE + id).remove(KEY_TAB + id).remove(KEY_INDEX + id);
        editor.apply();
    }
}
