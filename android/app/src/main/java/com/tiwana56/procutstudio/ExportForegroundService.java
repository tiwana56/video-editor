// Repo-relative path: android/app/src/main/java/com/tiwana56/procutstudio/ExportForegroundService.java
// ProCut Studio — Phase A: foreground service that keeps the Android process
// (and therefore the WebView's JS export loop) alive while the app is
// backgrounded. Design note: work/phase2-prep/background-export-design.md §3.
// The service itself NEVER touches the WebView or the Capacitor bridge — it
// only shows a progress notification and holds a partial wake lock, so it
// cannot crash if the WebView is gone.
//
// JAVA version of ExportForegroundService.kt (same file, same behaviour).
// Java is the RECOMMENDED pair for this repo: the repo has no Kotlin Gradle
// plugin and MainActivity is Java, so these .java files compile with ZERO
// Gradle change. Use EITHER this pair OR the .kt pair + build-gradle.patch.md
// — never both (same class names in two languages = duplicate-class error).
//
// Requires (see AndroidManifest.patch.md):
//   * manifest permissions FOREGROUND_SERVICE, FOREGROUND_SERVICE_MEDIA_PROCESSING,
//     WAKE_LOCK, POST_NOTIFICATIONS + the <service> entry
//   * minSdk 24 / targetSdk 36 (variables.gradle, as fetched 28 Nov 2026)
package com.tiwana56.procutstudio;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import androidx.core.app.NotificationCompat;

public class ExportForegroundService extends Service {

    public static final String ACTION_START = "com.tiwana56.procutstudio.action.START_EXPORT";
    public static final String ACTION_UPDATE = "com.tiwana56.procutstudio.action.UPDATE_PROGRESS";
    public static final String ACTION_STOP = "com.tiwana56.procutstudio.action.STOP_EXPORT";

    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_PROGRESS = "progress";
    public static final String EXTRA_TEXT = "text";

    public static final int NOTIFICATION_ID = 1001;
    public static final String CHANNEL_ID = "procut_export";
    private static final String CHANNEL_NAME = "ProCut export";

    // Safety net so a leaked wake lock can never drain the battery
    // forever: the OS releases it after 1h even if stop() is missed.
    // Normal exports are <= 15 min (fast-export cap in index.html).
    private static final long WAKE_LOCK_TIMEOUT_MS = 60L * 60L * 1000L;
    private static final String WAKE_LOCK_TAG = "ProCutStudio:ExportWakeLock";

    // Read by the plugin so stop()/updateProgress() can be fail-soft.
    public static volatile boolean isRunning = false;

    private PowerManager.WakeLock wakeLock = null;
    private String lastTitle = "Exporting video…";
    private int lastProgress = 0;
    private String lastText = "";

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && intent.getAction() != null) {
            String action = intent.getAction();
            if (ACTION_START.equals(action)) {
                String t = intent.getStringExtra(EXTRA_TITLE);
                if (t != null) lastTitle = t;
                lastProgress = 0;
                lastText = "";
                startExport();
            } else if (ACTION_UPDATE.equals(action)) {
                lastProgress = Math.max(0, Math.min(100, intent.getIntExtra(EXTRA_PROGRESS, lastProgress)));
                String tx = intent.getStringExtra(EXTRA_TEXT);
                if (tx != null) lastText = tx;
                if (isRunning) updateNotification();
            } else if (ACTION_STOP.equals(action)) {
                stopExport();
            }
            // Unknown / null action (e.g. system restart of the service):
            // do nothing — never crash, never restart the export by itself.
        }
        // Do NOT restart automatically if the system kills us: a half-done
        // export must never silently resume and produce a corrupt file.
        return START_NOT_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        releaseWakeLock();
        isRunning = false;
        super.onDestroy();
    }

    private void startExport() {
        acquireWakeLock();
        Notification notification = buildNotification();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROCESSING
            );
        } else {
            // minSdk is 24; the 3-arg startForeground() needs API 29+.
            startForeground(NOTIFICATION_ID, notification);
        }
        isRunning = true;
    }

    private void stopExport() {
        if (isRunning) {
            // STOP_FOREGROUND_REMOVE needs API 24+; minSdk is 24, so safe.
            stopForeground(Service.STOP_FOREGROUND_REMOVE);
        }
        releaseWakeLock();
        isRunning = false;
        stopSelf();
    }

    private void updateNotification() {
        NotificationManager manager =
                (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        manager.notify(NOTIFICATION_ID, buildNotification());
    }

    private Notification buildNotification() {
        // Tapping the notification brings ProCut back to the foreground.
        Intent openApp = new Intent(this, MainActivity.class);
        openApp.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pending = PendingIntent.getActivity(
                this, 0, openApp,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        String text = (lastText != null && !lastText.isEmpty())
                ? lastText
                : "Exporting in background — " + lastProgress + "%";
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle(lastTitle)
                .setContentText(text)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentIntent(pending)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setProgress(100, lastProgress, false)
                .build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW // no sound / vibration
        );
        channel.setDescription("Shows video export progress while ProCut runs in the background");
        NotificationManager manager =
                (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        manager.createNotificationChannel(channel);
    }

    private void acquireWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) return;
        PowerManager power = (PowerManager) getSystemService(Context.POWER_SERVICE);
        wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, WAKE_LOCK_TAG);
        wakeLock.acquire(WAKE_LOCK_TIMEOUT_MS);
    }

    private void releaseWakeLock() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        } catch (RuntimeException ignored) {
            // Releasing an already-released lock throws; the service is
            // stopping anyway, so swallow it rather than crashing.
        } finally {
            wakeLock = null;
        }
    }
}
