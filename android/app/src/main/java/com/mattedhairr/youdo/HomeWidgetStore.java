package com.mattedhairr.youdo;

import android.content.Context;
import android.content.SharedPreferences;
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

    /**
     * The app's new snapshot. Rooms the app has not loaded keep the last ones,
     * and card moves it has not applied yet stay as the widget showed them.
     */
    static synchronized void saveSnapshot(Context ctx, String json) throws Exception {
        JSONObject incoming = new JSONObject(json);
        if (incoming.isNull("rooms")) {
            JSONObject current = snapshot(ctx);
            JSONArray rooms = current != null ? current.optJSONArray("rooms") : null;
            incoming.put("rooms", rooms != null ? rooms : new JSONArray());
        }
        JSONArray pending = actions(ctx);
        for (int i = 0; i < pending.length(); i++) {
            JSONObject action = pending.optJSONObject(i);
            if (action != null && "move".equals(action.optString("type"))) {
                move(incoming, action.optString("taskId"), "up".equals(action.optString("dir")));
            }
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

    static int indexOfTask(JSONObject snapshot, String taskId) {
        JSONArray today = snapshot == null ? null : snapshot.optJSONArray("today");
        if (today == null) return -1;
        for (int i = 0; i < today.length(); i++) {
            JSONObject card = today.optJSONObject(i);
            if (card != null && taskId.equals(card.optString("id"))) return i;
        }
        return -1;
    }

    /** Swaps a card with its neighbour, as planWidgetMoves does in the app. */
    private static boolean move(JSONObject snapshot, String taskId, boolean up) {
        JSONArray today = snapshot.optJSONArray("today");
        int from = indexOfTask(snapshot, taskId);
        int to = up ? from - 1 : from + 1;
        if (today == null || from < 0 || to < 0 || to >= today.length()) return false;
        try {
            JSONObject a = today.getJSONObject(from);
            JSONObject b = today.getJSONObject(to);
            int rank = a.optInt("rank");
            a.put("rank", b.optInt("rank"));
            b.put("rank", rank);
            today.put(from, b);
            today.put(to, a);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /** ▲ or ▼ on a card: shown at once, applied by the app when it next opens. */
    static synchronized boolean moveFromWidget(Context ctx, String taskId, boolean up) {
        JSONObject snapshot = snapshot(ctx);
        if (snapshot == null || taskId == null || !move(snapshot, taskId, up)) return false;
        try {
            JSONObject action = new JSONObject().put("type", "move").put("taskId", taskId).put("dir", up ? "up" : "down");
            return prefs(ctx).edit()
                .putString(KEY_SNAPSHOT, snapshot.toString())
                .putString(KEY_ACTIONS, queued(ctx, action).toString())
                .commit();
        } catch (Exception e) {
            return false;
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

    /** The goal (Progress) or room (Room) a widget shows. */
    static String choice(Context ctx, int widgetId) {
        return prefs(ctx).getString(KEY_CHOICE + widgetId, null);
    }

    static void setChoice(Context ctx, int widgetId, String id) {
        prefs(ctx).edit().putString(KEY_CHOICE + widgetId, id).commit();
    }

    static void forget(Context ctx, int[] widgetIds) {
        SharedPreferences.Editor editor = prefs(ctx).edit();
        for (int id : widgetIds) editor.remove(KEY_CHOICE + id);
        editor.apply();
    }
}
