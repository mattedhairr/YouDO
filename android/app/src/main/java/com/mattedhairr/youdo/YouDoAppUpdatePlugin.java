package com.mattedhairr.youdo;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.os.SystemClock;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;

/** Only installs a newer YouDO APK signed by the currently installed signer. */
@CapacitorPlugin(name = "YouDoAppUpdate")
public class YouDoAppUpdatePlugin extends Plugin {
    private final AtomicBoolean busy = new AtomicBoolean(false);
    private volatile String preparedVersion;
    private volatile String preparedDigest;

    private File apkFile() { return new File(getContext().getCacheDir(), "youdo-updates/update.apk"); }
    private boolean installAllowed() {
        return Build.VERSION.SDK_INT < 26 || getContext().getPackageManager().canRequestPackageInstalls();
    }
    private static String hex(byte[] bytes) {
        StringBuilder out = new StringBuilder();
        for (byte b : bytes) out.append(String.format("%02x", b & 0xff));
        return out.toString();
    }
    private static boolean allowedUrl(URL url, boolean first) {
        if (!"https".equals(url.getProtocol()) || url.getUserInfo() != null
            || (url.getPort() != -1 && url.getPort() != 443)) return false;
        if ("github.com".equals(url.getHost())) {
            return url.getPath().startsWith("/mattedhairr/YouDO/releases/download/")
                && url.getPath().endsWith(".apk");
        }
        return !first && "release-assets.githubusercontent.com".equals(url.getHost());
    }
    private static Set<String> signers(PackageInfo info) throws Exception {
        Signature[] signatures = Build.VERSION.SDK_INT >= 28
            ? (info.signingInfo == null ? null : info.signingInfo.getApkContentsSigners()) : info.signatures;
        if (signatures == null || signatures.length == 0) throw new Exception("APK signing information is missing.");
        Set<String> result = new HashSet<>();
        for (Signature signature : signatures) result.add(hex(MessageDigest.getInstance("SHA-256").digest(signature.toByteArray())));
        return result;
    }
    private void verify(File file, String version, String digest) throws Exception {
        MessageDigest sha = MessageDigest.getInstance("SHA-256");
        try (InputStream input = new FileInputStream(file)) {
            byte[] buffer = new byte[32768]; int count;
            while ((count = input.read(buffer)) != -1) sha.update(buffer, 0, count);
        }
        if (!MessageDigest.isEqual(sha.digest(), decodeHex(digest))) throw new Exception("Download verification failed. Please download again.");
        PackageManager pm = getContext().getPackageManager();
        int flags = Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        PackageInfo candidate = pm.getPackageArchiveInfo(file.getAbsolutePath(), flags);
        PackageInfo installed = pm.getPackageInfo(getContext().getPackageName(), flags);
        if (candidate == null || !installed.packageName.equals(candidate.packageName)
            || !version.equals(candidate.versionName) || !signers(installed).equals(signers(candidate))) {
            throw new Exception("This APK is not a matching official YouDO update.");
        }
        long next = Build.VERSION.SDK_INT >= 28 ? candidate.getLongVersionCode() : candidate.versionCode;
        long current = Build.VERSION.SDK_INT >= 28 ? installed.getLongVersionCode() : installed.versionCode;
        if (next <= current) throw new Exception("The downloaded APK is not newer than this installation.");
    }
    private static byte[] decodeHex(String value) {
        byte[] bytes = new byte[32];
        for (int i = 0; i < bytes.length; i++) bytes[i] = (byte) Integer.parseInt(value.substring(i * 2, i * 2 + 2), 16);
        return bytes;
    }

    @PluginMethod
    public void prepareUpdate(PluginCall call) {
        String source = call.getString("url", "");
        String digest = call.getString("sha256", "");
        String version = call.getString("version", "");
        if (!digest.matches("[a-fA-F0-9]{64}") || !version.matches("[0-9]+\\.[0-9]+\\.[0-9]+")) {
            call.reject("Invalid update metadata."); return;
        }
        try { if (!allowedUrl(new URL(source), true)) throw new Exception(); }
        catch (Exception error) { call.reject("Only official YouDO release downloads are allowed."); return; }
        if (!busy.compareAndSet(false, true)) { call.reject("An update download is already running."); return; }
        new Thread(() -> {
            File destination = apkFile();
            File partial = new File(destination.getParentFile(), "download.part");
            preparedVersion = null; preparedDigest = null;
            try {
                if (!destination.getParentFile().isDirectory() && !destination.getParentFile().mkdirs()) throw new Exception("Could not create the update folder.");
                URL url = new URL(source);
                HttpURLConnection connection = null;
                long deadline = SystemClock.elapsedRealtime() + 180_000;
                try {
                    for (int redirect = 0; redirect <= 5; redirect++) {
                        if (!allowedUrl(url, redirect == 0)) throw new Exception("Update redirected to an unsupported host.");
                        connection = (HttpURLConnection) url.openConnection();
                        connection.setInstanceFollowRedirects(false);
                        connection.setConnectTimeout(15_000); connection.setReadTimeout(20_000);
                        connection.setRequestProperty("Accept", "application/octet-stream");
                        int status = connection.getResponseCode();
                        if (Arrays.asList(301, 302, 303, 307, 308).contains(status)) {
                            String location = connection.getHeaderField("Location");
                            connection.disconnect(); connection = null;
                            if (location == null || redirect == 5) throw new Exception("Too many download redirects.");
                            url = new URL(url, location); continue;
                        }
                        if (status != 200) throw new Exception("Download unavailable. Please try again later.");
                        long maximum = 100L * 1024 * 1024;
                        if (connection.getContentLengthLong() > maximum) throw new Exception("Update download is too large.");
                        try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(partial)) {
                            byte[] buffer = new byte[32768]; long total = 0; int count;
                            while ((count = input.read(buffer)) != -1) {
                                total += count;
                                if (total > maximum || SystemClock.elapsedRealtime() > deadline) throw new Exception("Download interrupted. Please try again.");
                                output.write(buffer, 0, count);
                            }
                            output.getFD().sync();
                        }
                        break;
                    }
                } finally { if (connection != null) connection.disconnect(); }
                verify(partial, version, digest);
                if (destination.exists() && !destination.delete()) throw new Exception("Could not replace the previous download.");
                if (!partial.renameTo(destination)) throw new Exception("Could not save the update.");
                preparedVersion = version; preparedDigest = digest;
                JSObject result = new JSObject(); result.put("ready", true); result.put("installAllowed", installAllowed());
                call.resolve(result);
            } catch (Exception error) {
                partial.delete(); call.reject(error.getMessage() == null ? "Could not download the update." : error.getMessage());
            } finally { busy.set(false); }
        }, "youdo-update-download").start();
    }

    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                if (!installAllowed()) getActivity().startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getContext().getPackageName())));
                call.resolve();
            } catch (Exception error) { call.reject("Open Android Settings to allow updates from YouDO."); }
        });
    }

    @PluginMethod
    public void installUpdate(PluginCall call) {
        if (!busy.compareAndSet(false, true)) { call.reject("An update operation is already running."); return; }
        if (preparedVersion == null || preparedDigest == null) { busy.set(false); call.reject("Please download the update again."); return; }
        if (!installAllowed()) { busy.set(false); JSObject result = new JSObject(); result.put("permissionRequired", true); call.resolve(result); return; }
        new Thread(() -> {
            try {
                verify(apkFile(), preparedVersion, preparedDigest);
                getActivity().runOnUiThread(() -> {
                    try {
                        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apkFile());
                        Intent intent = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
                            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        getActivity().startActivity(intent);
                        JSObject result = new JSObject(); result.put("permissionRequired", false); call.resolve(result);
                    } catch (Exception error) { call.reject("Android could not open the installer."); }
                    finally { busy.set(false); }
                });
            } catch (Exception error) { busy.set(false); call.reject(error.getMessage()); }
        }, "youdo-update-verify").start();
    }
}
