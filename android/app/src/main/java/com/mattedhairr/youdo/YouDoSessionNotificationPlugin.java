package com.mattedhairr.youdo;

import android.Manifest;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.lang.ref.WeakReference;
import org.json.JSONObject;

@CapacitorPlugin(
    name = "YouDoSessionNotification",
    permissions = {
        @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications")
    }
)
public class YouDoSessionNotificationPlugin extends Plugin {
    private static WeakReference<YouDoSessionNotificationPlugin> current;

    static void emitSession(JSONObject session) {
        YouDoSessionNotificationPlugin plugin = current != null ? current.get() : null;
        if (plugin == null || session == null) return;
        try {
            JSObject data = new JSObject();
            data.put("session", new JSObject(session.toString()));
            plugin.notifyListeners("sessionUpdated", data, true);
        } catch (Exception ignored) {
            /* bridge not ready */
        }
    }

    @Override
    public void load() {
        current = new WeakReference<>(this);
    }

    @Override
    protected void handleOnDestroy() {
        if (current != null && current.get() == this) {
            current = null;
        }
        super.handleOnDestroy();
    }

    @PluginMethod
    public void sync(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33) {
            if (getPermissionState("notifications") != com.getcapacitor.PermissionState.GRANTED) {
                requestPermissionForAlias("notifications", call, "permissionResult");
                return;
            }
        }
        post(call);
    }

    @PermissionCallback
    private void permissionResult(PluginCall call) {
        if (getPermissionState("notifications") == com.getcapacitor.PermissionState.GRANTED) {
            post(call);
        } else {
            call.resolve();
        }
    }

    @PluginMethod
    public void clear(PluginCall call) {
        SessionNotificationStore.clear(getContext());
        call.resolve();
    }

    @PluginMethod
    public void getSession(PluginCall call) {
        String raw = SessionNotificationStore.sessionJson(getContext());
        JSObject data = new JSObject();
        if (raw != null) {
            try {
                data.put("session", new JSObject(raw));
            } catch (Exception ignored) {
                /* malformed */
            }
        }
        call.resolve(data);
    }

    private void post(PluginCall call) {
        boolean paused = Boolean.TRUE.equals(call.getBoolean("paused", false));
        String title = call.getString("title", "Sitting in progress");
        String sessionJson = call.getString("sessionJson");
        if (sessionJson != null && !sessionJson.isEmpty()) {
            SessionNotificationStore.save(getContext(), sessionJson, title);
        }
        SessionNotificationStore.show(getContext(), paused, title);
        call.resolve();
    }
}
