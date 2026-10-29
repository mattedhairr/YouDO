package com.mattedhairr.youdo;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;
import java.security.SecureRandom;
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
    private static final int MAX_ACTIONS = 100;

    private HomeWidgetStore() {}

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static JSONObject snapshot(Context ctx) {
        String raw = prefs(ctx).getString(KEY_SNAPSHOT, null);
        if (raw == null) return null;
        try {
            return new JSONObject(raw);
        } catch (Exception e) {
            return null;
        }
    }

    /** The app's new snapshot. Rooms the app has not loaded keep the last ones. */
    static synchronized void saveSnapshot(Context ctx, String json) throws Exception {
        JSONObject incoming = new JSONObject(json);
        if (incoming.isNull("rooms")) {
            JSONObject current = snapshot(ctx);
            JSONArray rooms = current != null ? current.optJSONArray("rooms") : null;
            incoming.put("rooms", rooms != null ? rooms : new JSONArray());
        }
        prefs(ctx).edit().putString(KEY_SNAPSHOT, incoming.toString()).apply();
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

    /** A room-mate started, paused, resumed or stopped (silent push, see hub_widget_push.sql). */
    static synchronized boolean applyFocusStatus(Context ctx, Map<String, String> data) {
        JSONObject snapshot = snapshot(ctx);
        String member = data.get("member");
        String state = data.get("state");
        if (snapshot == null || member == null || state == null) return false;
        long updatedAt = parseLong(data.get("updated_at"));
        long startedAt = parseLong(data.get("started_at"));
        JSONArray rooms = snapshot.optJSONArray("rooms");
        boolean changed = false;
        try {
            for (int r = 0; rooms != null && r < rooms.length(); r++) {
                JSONArray members = rooms.getJSONObject(r).optJSONArray("members");
                for (int m = 0; members != null && m < members.length(); m++) {
                    JSONObject person = members.getJSONObject(m);
                    // Pushes can arrive out of order; an older one never wins.
                    if (!member.equals(person.optString("id")) || person.optLong("updatedAt") > updatedAt) continue;
                    person.put("state", state);
                    person.put("startedAt", startedAt > 0 ? startedAt : JSONObject.NULL);
                    person.put("pausedMs", Math.max(0, parseLong(data.get("paused_ms"))));
                    person.put("updatedAt", updatedAt);
                    changed = true;
                }
            }
            if (changed) prefs(ctx).edit().putString(KEY_SNAPSHOT, snapshot.toString()).apply();
        } catch (Exception e) {
            return false;
        }
        return changed;
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
