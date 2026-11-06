package com.mattedhairr.youdo;

import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * "Open with YouDO" and Share for audio files. The file is copied into the
 * app's private cache, and the web side is told so it can offer to add it to
 * Your sounds. Nothing leaves the phone.
 */
final class IncomingSound {
    /** Same limit as the web side (OWN_SOUND_MAX_BYTES). */
    private static final long MAX_BYTES = 60L * 1024 * 1024;
    private static final String DIR = "incoming-sound";

    private static String pendingPath;
    private static String pendingName;

    private IncomingSound() {}

    /** True when the intent carried an audio file; the copy runs in the background. */
    static boolean handle(Context context, Intent intent) {
        if (intent == null) return false;
        String action = intent.getAction();
        Uri uri = null;
        if (Intent.ACTION_VIEW.equals(action)) {
            uri = intent.getData();
        } else if (Intent.ACTION_SEND.equals(action)) {
            Object extra = intent.getExtras() == null ? null : intent.getExtras().get(Intent.EXTRA_STREAM);
            if (extra instanceof Uri) uri = (Uri) extra;
        }
        if (uri == null) return false;
        String scheme = uri.getScheme();
        // content:// only: reading a raw file path would need storage permission.
        if (!ContentResolver.SCHEME_CONTENT.equals(scheme)) return false;
        String type = intent.getType();
        if (type == null) type = context.getContentResolver().getType(uri);
        if (type == null || !(type.startsWith("audio/") || type.equals("application/ogg"))) return false;

        final Context app = context.getApplicationContext();
        final Uri source = uri;
        new Thread(() -> copy(app, source), "youdo-incoming-sound").start();
        // Handled: a later rotation or relaunch must not add it again.
        intent.setAction(Intent.ACTION_MAIN);
        intent.setData(null);
        intent.removeExtra(Intent.EXTRA_STREAM);
        return true;
    }

    private static void copy(Context app, Uri source) {
        String name = displayName(app, source);
        File dir = new File(app.getCacheDir(), DIR);
        if (!dir.exists() && !dir.mkdirs()) return;
        File[] old = dir.listFiles();
        if (old != null) for (File f : old) f.delete();
        File target = new File(dir, "sound-" + System.currentTimeMillis());
        long total = 0;
        boolean ok = false;
        try (InputStream in = app.getContentResolver().openInputStream(source);
             OutputStream out = new FileOutputStream(target)) {
            if (in != null) {
                byte[] chunk = new byte[64 * 1024];
                int read;
                ok = true;
                while ((read = in.read(chunk)) != -1) {
                    total += read;
                    if (total > MAX_BYTES) { ok = false; break; }
                    out.write(chunk, 0, read);
                }
            }
        } catch (Exception e) {
            ok = false;
        }
        if (!ok) {
            target.delete();
            // Tell the web side anyway, so it can say why nothing was added.
            set("", total > MAX_BYTES ? "too-big" : "unreadable");
        } else {
            set(target.getAbsolutePath(), name);
        }
        YouDoFocusSoundPlugin.notifyIncomingSound();
    }

    private static String displayName(Context app, Uri uri) {
        try (Cursor cursor = app.getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                String name = cursor.getString(0);
                if (name != null && !name.isEmpty()) return name;
            }
        } catch (Exception ignored) {
            // Some apps share without a name.
        }
        String last = uri.getLastPathSegment();
        return last == null ? "My sound" : last;
    }

    private static synchronized void set(String path, String name) {
        pendingPath = path;
        pendingName = name;
    }

    /** The waiting file, once: {path, name}, or null. An empty path carries the reason in name. */
    static synchronized String[] take() {
        if (pendingPath == null) return null;
        String[] out = new String[] { pendingPath, pendingName };
        pendingPath = null;
        pendingName = null;
        return out;
    }

    /** The web side has read the file (or turned it down): free the space. */
    static void clear(Context context) {
        File dir = new File(context.getCacheDir(), DIR);
        File[] files = dir.listFiles();
        if (files != null) for (File f : files) f.delete();
    }
}
