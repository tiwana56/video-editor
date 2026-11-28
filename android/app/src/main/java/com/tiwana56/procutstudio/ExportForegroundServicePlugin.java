// Repo-relative path: android/app/src/main/java/com/tiwana56/procutstudio/ExportForegroundServicePlugin.java
// ProCut Studio — Phase A: Capacitor 8 bridge for ExportForegroundService.
// Design note: work/phase2-prep/background-export-design.md §3.
//
// JAVA version of ExportForegroundServicePlugin.kt (same behaviour).
// Java is the RECOMMENDED pair for this repo (no Kotlin Gradle plugin in the
// repo; MainActivity is Java). Use EITHER this pair OR the .kt pair +
// build-gradle.patch.md — never both (same class names in two languages).
//
// JS contract (DO NOT rename — Phase B JS implements against exactly this):
//   window.Capacitor.Plugins.ExportForegroundService
//     .start({ title: string })                         -> Promise<{ running: true }>
//     .updateProgress({ progress: 0-100, text: string }) -> Promise<{ running: boolean }>
//     .stop()                                           -> Promise<{ running: false }>
// Plugin name in @CapacitorPlugin MUST stay "ExportForegroundService" — it is
// what Capacitor exposes under window.Capacitor.Plugins.
//
// Fail-soft by design: stop() / updateProgress() when the service was never
// started resolve normally ({ running: false }) instead of rejecting — the
// export's finally-block must never throw. The plugin never assumes the
// WebView is present: it only uses the Activity Context + Intents, so the
// service keeps running (and can be stopped) even if the WebView is gone.
// Register in MainActivity — see MainActivity.patch.md.
package com.tiwana56.procutstudio;

import android.content.Context;
import android.content.Intent;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ExportForegroundService")
public class ExportForegroundServicePlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        Context ctx = getContext();
        if (ctx == null) {
            call.reject("ExportForegroundService: no Context");
            return;
        }
        String title = call.getString("title");
        if (title == null) title = "Exporting video…";
        Intent intent = new Intent(ctx, ExportForegroundService.class);
        intent.setAction(ExportForegroundService.ACTION_START);
        intent.putExtra(ExportForegroundService.EXTRA_TITLE, title);
        // startForegroundService() needs API 26+; minSdk is 24.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ctx.startForegroundService(intent);
        } else {
            ctx.startService(intent);
        }
        JSObject ret = new JSObject();
        ret.put("running", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void updateProgress(PluginCall call) {
        Context ctx = getContext();
        if (ctx == null) {
            call.reject("ExportForegroundService: no Context");
            return;
        }
        if (!ExportForegroundService.isRunning) {
            // Fail-soft: progress update with no export running is a no-op,
            // not an error (e.g. export already finished, stop() already ran).
            JSObject ret = new JSObject();
            ret.put("running", false);
            call.resolve(ret);
            return;
        }
        Integer p = call.getInt("progress");
        int progress = (p == null) ? 0 : Math.max(0, Math.min(100, p.intValue()));
        String text = call.getString("text");
        if (text == null) text = "";
        Intent intent = new Intent(ctx, ExportForegroundService.class);
        intent.setAction(ExportForegroundService.ACTION_UPDATE);
        intent.putExtra(ExportForegroundService.EXTRA_PROGRESS, progress);
        intent.putExtra(ExportForegroundService.EXTRA_TEXT, text);
        ctx.startService(intent);
        JSObject ret = new JSObject();
        ret.put("running", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Context ctx = getContext();
        if (ctx == null) {
            call.reject("ExportForegroundService: no Context");
            return;
        }
        if (!ExportForegroundService.isRunning) {
            // Fail-soft: stopping a service that was never started (or
            // already stopped) must not crash and must not start it just
            // to stop it — resolve normally.
            JSObject ret = new JSObject();
            ret.put("running", false);
            call.resolve(ret);
            return;
        }
        Intent intent = new Intent(ctx, ExportForegroundService.class);
        intent.setAction(ExportForegroundService.ACTION_STOP);
        ctx.startService(intent);
        JSObject ret = new JSObject();
        ret.put("running", false);
        call.resolve(ret);
    }

    // NOTE: no load()/WebView reference anywhere in this file on purpose.
    // The service is driven purely by Intents so it survives the WebView
    // being paused or destroyed.
}
