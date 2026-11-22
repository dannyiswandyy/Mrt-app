package sg.mrttracker.app;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Public MRT Spotter: refresh the same all-line LTA timetable as the website about
 * once per hour, without downloading a new APK. GitHub Pages publishes the
 * timetable hourly. Android JobScheduler is inexact and requires connectivity.
 * A validated, cached copy is used offline; the APK's copy is the fallback.
 */
public final class HourlyTimetable extends JobService {
    private static final long EVERY_MS = 60L * 60L * 1000L;
    private static final int JOB_ID = 7339;
    private static final int MAX_BYTES = 8 * 1024 * 1024;
    private static final String URL =
            "https://dannyiswandyy.github.io/Mrt-app/data/timetable.json";
    private static final String FILE = "timetable-hourly.json";
    private static final AtomicBoolean BUSY = new AtomicBoolean(false);

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences("hourly_timetable", Context.MODE_PRIVATE);
    }

    private static long installedAt(Context c) {
        try {
            return c.getPackageManager().getPackageInfo(c.getPackageName(), 0).lastUpdateTime;
        } catch (Exception ignored) {
            return 0;
        }
    }

    private static File savedFile(Context c) {
        return new File(c.getFilesDir(), FILE);
    }

    static long version(Context c) {
        File f = savedFile(c);
        return f.isFile() && f.length() > 0 && f.lastModified() > installedAt(c)
                ? f.lastModified() : installedAt(c);
    }

    /** The newest validated copy, falling back to the timetable bundled with this APK. */
    static String current(Context c) {
        File f = savedFile(c);
        if (f.isFile() && f.length() > 0 && f.lastModified() > installedAt(c)) {
            try (InputStream in = new FileInputStream(f)) {
                return readAll(in, MAX_BYTES);
            } catch (Exception ignored) {}
        }
        try (InputStream in = c.getAssets().open("timetable.json")) {
            return readAll(in, MAX_BYTES);
        } catch (Exception ignored) {
            return "";
        }
    }

    static void schedule(Context c) {
        try {
            JobScheduler scheduler = (JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
            if (scheduler == null) return;
            for (JobInfo job : scheduler.getAllPendingJobs()) {
                if (job.getId() == JOB_ID) return;
            }
            scheduler.schedule(new JobInfo.Builder(
                    JOB_ID, new ComponentName(c, HourlyTimetable.class))
                    .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                    .setPeriodic(EVERY_MS)
                    .setPersisted(true)
                    .build());
        } catch (Exception ignored) {}
    }

    /** Check on app open too; refreshes are capped to one attempt per hour. */
    static void checkIfDue(Context c, Runnable whenChanged) {
        Context app = c.getApplicationContext();
        if (!due(app)) return;
        new Thread(() -> {
            boolean changed = refresh(app);
            if (changed && whenChanged != null)
                new Handler(Looper.getMainLooper()).post(whenChanged);
        }, "MrtHourlyTimetable").start();
    }

    private static boolean due(Context c) {
        return System.currentTimeMillis() - prefs(c).getLong("lastAttempt", 0L) >= EVERY_MS;
    }

    @Override
    public boolean onStartJob(JobParameters params) {
        new Thread(() -> {
            refresh(getApplicationContext());
            jobFinished(params, false);
        }, "MrtHourlyTimetableJob").start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true;
    }

    private static boolean refresh(Context c) {
        if (!due(c) || !BUSY.compareAndSet(false, true)) return false;
        try {
            // Record attempts, including failures, to avoid retry storms when offline.
            prefs(c).edit().putLong("lastAttempt", System.currentTimeMillis()).apply();
            HttpURLConnection conn = (HttpURLConnection) new URL(URL).openConnection();
            String raw;
            try {
                conn.setConnectTimeout(12000);
                conn.setReadTimeout(20000);
                conn.setUseCaches(false);
                conn.setRequestProperty("Accept", "application/json");
                if (conn.getResponseCode() != 200) return false;
                try (InputStream in = conn.getInputStream()) {
                    raw = readAll(in, MAX_BYTES);
                }
            } finally {
                conn.disconnect();
            }
            JSONObject incoming = new JSONObject(raw);
            JSONObject feed = incoming.optJSONObject("feed");
            JSONObject lines = incoming.optJSONObject("lines");
            if (feed == null || lines == null || lines.length() < 7
                    || incoming.optJSONArray("services") == null
                    || incoming.getJSONArray("services").length() == 0) return false;

            // Do not replace a newer bundled/cached timetable with older published data.
            String old = current(c);
            if (!old.isEmpty()) {
                JSONObject previous = new JSONObject(old);
                JSONObject oldFeed = previous.optJSONObject("feed");
                String priorDate = oldFeed == null ? "" : oldFeed.optString("built", "");
                String nextDate = feed.optString("built", "");
                if (!priorDate.isEmpty() && !nextDate.isEmpty()
                        && nextDate.compareTo(priorDate) < 0) return false;
                if (sameSchedule(old, raw)) return false;
            }
            File temp = new File(c.getFilesDir(), FILE + ".tmp");
            try (FileOutputStream output = new FileOutputStream(temp)) {
                output.write(raw.getBytes(StandardCharsets.UTF_8));
                output.getFD().sync();
            }
            if (!temp.renameTo(savedFile(c))) {
                temp.delete();
                return false;
            }
            return true;
        } catch (Exception ignored) {
            // Offline or invalid downloads leave the previous timetable intact.
            return false;
        } finally {
            BUSY.set(false);
        }
    }

    private static boolean sameSchedule(String a, String b) {
        // The feed's build timestamp may change even if no trip/calendar did.
        int startA = a.indexOf(",\"services\":");
        int startB = b.indexOf(",\"services\":");
        return startA >= 0 && startB >= 0
                && a.substring(startA).equals(b.substring(startB));
    }

    private static String readAll(InputStream in, int limit) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int count;
        while ((count = in.read(buf)) != -1) {
            if (out.size() + count > limit) throw new java.io.IOException("Timetable too large");
            out.write(buf, 0, count);
        }
        return out.toString(StandardCharsets.UTF_8.name());
    }
}
