package com.mattedhairr.youdo;

import android.graphics.Bitmap;
import android.graphics.BlurMaskFilter;
import android.graphics.Canvas;
import android.graphics.DashPathEffect;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Shader;
import androidx.core.graphics.ColorUtils;

/**
 * Draws the shapes widgets cannot be built from: Day Arc's arc and goal gauge,
 * and the Room widget's lines. Drawn at 1.5 px per dp, which keeps the bitmaps
 * small enough to send to the launcher while staying smooth.
 */
final class ArcPainter {
    static final int OPEN = 0;
    static final int DONE = 1;
    static final int NOW = 2;
    static final int LATE = 3;
    static final int LATE_NOW = 4;

    private static final float SCALE = 1.5f;
    private static final int SUN = 0xFFFFCF6B;

    private ArcPainter() {}

    /** The colours to draw with, for the phone's current light or dark mode. */
    static final class Palette {
        final int accent;
        final int dim;
        final int knob;
        final int late;
        final int live;

        Palette(int accent, int dim, int knob, int late, int live) {
            this.accent = accent;
            this.dim = dim;
            this.knob = knob;
            this.late = late;
            this.live = live;
        }
    }

    /** The upper half circle that fits the box, as {centre x, centre y, radius} in px. */
    private static float[] frame(int w, int h, float outset) {
        float stroke = 7 * SCALE;
        float cy = h - stroke - 2 * SCALE;
        float r = Math.min(w / 2f - outset - stroke - 2 * SCALE, cy - outset - stroke);
        return new float[] { w / 2f, cy, Math.max(r, 10 * SCALE) };
    }

    private static Paint stroke(int color, float widthDp) {
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeCap(Paint.Cap.ROUND);
        paint.setStrokeWidth(widthDp * SCALE);
        paint.setColor(color);
        return paint;
    }

    private static Paint fill(int color) {
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(color);
        return paint;
    }

    private static Paint glow(Paint base, float radiusDp, int alpha) {
        Paint paint = new Paint(base);
        paint.setMaskFilter(new BlurMaskFilter(radiusDp * SCALE, BlurMaskFilter.Blur.NORMAL));
        paint.setAlpha(alpha);
        return paint;
    }

    private static Bitmap bitmap(int widthDp, int heightDp) {
        return Bitmap.createBitmap(Math.max(1, Math.round(widthDp * SCALE)), Math.max(1, Math.round(heightDp * SCALE)), Bitmap.Config.ARGB_8888);
    }

    private static float[] point(float[] f, float radius, float degrees) {
        double a = Math.toRadians(degrees);
        return new float[] { (float) (f[0] + radius * Math.cos(a)), (float) (f[1] + radius * Math.sin(a)) };
    }

    /** The knob that marks where you are: a disc with a hole the arc shows through. */
    private static void knob(Canvas canvas, float[] at, int color, int centre) {
        canvas.drawCircle(at[0], at[1], 8 * SCALE, fill(color));
        canvas.drawCircle(at[0], at[1], 3.5f * SCALE, fill(centre));
    }

    /** The dotted time-of-day track around the arc, with the sun where the day is (sun in 0..1, or below 0 for none). */
    private static void dayTrack(Canvas canvas, float[] f, float sun, Palette palette) {
        float rt = f[2] + 11 * SCALE;
        Paint track = stroke(palette.dim, 1.5f);
        track.setPathEffect(new DashPathEffect(new float[] { 2 * SCALE, 5 * SCALE }, 0));
        canvas.drawArc(new RectF(f[0] - rt, f[1] - rt, f[0] + rt, f[1] + rt), 180, 180, false, track);
        if (sun < 0) return;
        float[] at = point(f, rt, 180 + 180 * Math.min(1f, sun));
        canvas.drawCircle(at[0], at[1], 9 * SCALE, glow(fill(SUN), 4, 110));
        canvas.drawCircle(at[0], at[1], 4.5f * SCALE, fill(SUN));
    }

    /**
     * Day Arc: one segment per task (OPEN, DONE, NOW, LATE or LATE_NOW). While
     * focusing, nowFill (0..1) fills the current segment in green as its steps
     * are done; it is below 0 otherwise.
     */
    static Bitmap dayArc(int widthDp, int heightDp, int[] segments, float nowFill, float sun, Palette palette) {
        Bitmap bitmap = bitmap(widthDp, heightDp);
        Canvas canvas = new Canvas(bitmap);
        float[] f = frame(bitmap.getWidth(), bitmap.getHeight(), 13 * SCALE);
        dayTrack(canvas, f, sun, palette);
        RectF box = new RectF(f[0] - f[2], f[1] - f[2], f[0] + f[2], f[1] + f[2]);
        int n = segments.length;
        if (n == 0) {
            canvas.drawArc(box, 180, 180, false, stroke(palette.dim, 9));
            return bitmap;
        }
        // Gaps shrink with many tasks so the arc never turns to dashes.
        float gap = Math.min(4.5f, 60f / n);
        float per = (180f - (n - 1) * gap) / n;
        float[] marker = null;
        int markerColor = palette.accent;
        for (int i = 0; i < n; i++) {
            float start = 180 + i * (per + gap);
            int state = segments[i];
            boolean late = state == LATE || state == LATE_NOW;
            boolean now = state == NOW || state == LATE_NOW;
            int color = state == OPEN ? palette.dim : late ? palette.late : palette.accent;
            if (state == DONE) canvas.drawArc(box, start, per, false, glow(stroke(color, 14), 4, 110));
            Paint segment = stroke(now ? ColorUtils.setAlphaComponent(color, 90) : late ? ColorUtils.setAlphaComponent(color, 120) : color, now ? 13 : 9);
            canvas.drawArc(box, start, per, false, segment);
            if (now) {
                float done = nowFill >= 0 ? per * Math.min(1f, nowFill) : 0;
                if (nowFill >= 0 && done > 0) canvas.drawArc(box, start, done, false, stroke(palette.live, 13));
                marker = point(f, f[2], start + done);
                markerColor = nowFill >= 0 ? palette.live : color;
            }
        }
        if (marker != null) knob(canvas, marker, palette.knob, markerColor);
        return bitmap;
    }

    /** The goal gauge: the share of the goal done, along the arc, glowing. */
    static Bitmap gauge(int widthDp, int heightDp, float pct, Palette palette) {
        Bitmap bitmap = bitmap(widthDp, heightDp);
        Canvas canvas = new Canvas(bitmap);
        float[] f = frame(bitmap.getWidth(), bitmap.getHeight(), 6 * SCALE);
        RectF box = new RectF(f[0] - f[2], f[1] - f[2], f[0] + f[2], f[1] + f[2]);
        canvas.drawArc(box, 180, 180, false, stroke(palette.dim, 9));
        float sweep = 180 * Math.max(0f, Math.min(1f, pct));
        if (sweep > 0) {
            canvas.drawArc(box, 180, sweep, false, glow(stroke(palette.accent, 15), 5, 100));
            Paint fill = stroke(palette.accent, 9);
            fill.setShader(new LinearGradient(f[0] - f[2], 0, f[0] + f[2], 0,
                ColorUtils.setAlphaComponent(palette.accent, 130), palette.accent, Shader.TileMode.CLAMP));
            canvas.drawArc(box, 180, sweep, false, fill);
        }
        knob(canvas, point(f, f[2], 180 + sweep), palette.knob, palette.accent);
        return bitmap;
    }

    /**
     * The Room widget's lines, from each member's avatar to the room tile in the
     * middle: glowing green for whoever is focusing, dotted otherwise; the room
     * glows while anyone is. Each line leaves the avatar's edge toward the gap
     * between the two rows and curves into the tile's side, clear of the names.
     * Seats are avatar centres {x, y} in dp, in the order top left, top right,
     * bottom left, bottom right; null for an empty seat. centre is the tile's.
     */
    static Bitmap roomLines(int widthDp, int heightDp, float[][] seats, boolean[] live, float[] centre, Palette palette) {
        Bitmap bitmap = bitmap(widthDp, heightDp);
        Canvas canvas = new Canvas(bitmap);
        float cx = centre[0] * SCALE;
        float cy = centre[1] * SCALE;
        boolean anyLive = false;
        for (int i = 0; i < seats.length; i++) {
            if (seats[i] == null) continue;
            float dx = i % 2 == 0 ? 1 : -1;
            float dy = i < 2 ? 1 : -1;
            float edge = 24 * SCALE * 0.72f;
            float sx = seats[i][0] * SCALE + dx * edge;
            float sy = seats[i][1] * SCALE + dy * edge;
            float ex = cx - dx * 27 * SCALE;
            float ey = cy + (dy > 0 ? 2 : 12) * SCALE;
            Path path = new Path();
            path.moveTo(sx, sy);
            path.quadTo(cx - dx * 72 * SCALE, sy + dy * 3 * SCALE, ex, ey);
            if (live[i]) {
                anyLive = true;
                Paint line = stroke(palette.live, 2);
                canvas.drawPath(path, glow(line, 4, 160));
                canvas.drawPath(path, line);
            } else {
                Paint line = stroke(palette.dim, 1.4f);
                line.setPathEffect(new DashPathEffect(new float[] { 3 * SCALE, 5 * SCALE }, 0));
                canvas.drawPath(path, line);
            }
        }
        if (anyLive) canvas.drawCircle(cx, cy, 34 * SCALE, glow(fill(palette.live), 18, 90));
        return bitmap;
    }
}
