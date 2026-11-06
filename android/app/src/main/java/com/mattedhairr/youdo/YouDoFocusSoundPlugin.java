package com.mattedhairr.youdo;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.lang.ref.WeakReference;

/**
 * Focus sounds: "Keep playing" runs FocusSoundService while a sound plays, and
 * audio files opened with or shared to YouDO are handed to the web side.
 */
@CapacitorPlugin(name = "YouDoFocusSound")
public class YouDoFocusSoundPlugin extends Plugin {
    private static WeakReference<YouDoFocusSoundPlugin> instance = new WeakReference<>(null);

    @Override
    public void load() {
        instance = new WeakReference<>(this);
    }

    @PluginMethod
    public void keepAlive(PluginCall call) {
        try {
            if (Boolean.TRUE.equals(call.getBoolean("on", false))) FocusSoundService.start(getContext());
            else FocusSoundService.stop(getContext());
            call.resolve();
        } catch (Exception e) {
            // Android 12+ refuses to start it from the background; the app retries next time it is open.
            call.reject("Could not keep the focus sound running", e);
        }
    }

    /** The audio file waiting from "Open with YouDO" or Share: {path, name}, or {} when none. */
    @PluginMethod
    public void takeIncomingSound(PluginCall call) {
        String[] waiting = IncomingSound.take();
        JSObject result = new JSObject();
        if (waiting != null) {
            result.put("path", waiting[0]);
            result.put("name", waiting[1]);
        }
        call.resolve(result);
    }

    @PluginMethod
    public void clearIncomingSound(PluginCall call) {
        IncomingSound.clear(getContext());
        call.resolve();
    }

    /** A file has been copied: tell the page, if it is running. */
    static void notifyIncomingSound() {
        YouDoFocusSoundPlugin plugin = instance.get();
        if (plugin != null) plugin.notifyListeners("incomingSound", new JSObject());
    }
}
