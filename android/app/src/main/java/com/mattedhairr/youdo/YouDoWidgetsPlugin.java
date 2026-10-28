package com.mattedhairr.youdo;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** The app's side of the home-screen widgets (src/lib/homeWidgets.ts). */
@CapacitorPlugin(name = "YouDoWidgets")
public class YouDoWidgetsPlugin extends Plugin {
    @PluginMethod
    public void update(PluginCall call) {
        String snapshot = call.getString("snapshot");
        if (snapshot == null || snapshot.isEmpty()) {
            call.reject("Missing widget snapshot");
            return;
        }
        try {
            HomeWidgetStore.saveSnapshot(getContext(), snapshot);
            HomeWidgets.refreshAll(getContext());
            call.resolve();
        } catch (Exception e) {
            call.reject("Unreadable widget snapshot");
        }
    }

    @PluginMethod
    public void takeActions(PluginCall call) {
        JSObject result = new JSObject();
        try {
            result.put("actions", new JSArray(HomeWidgetStore.takeActions(getContext()).toString()));
        } catch (Exception e) {
            result.put("actions", new JSArray());
        }
        call.resolve(result);
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject result = new JSObject();
        result.put("roomWidgets", HomeWidgets.count(getContext(), RoomWidget.class));
        call.resolve(result);
    }
}
