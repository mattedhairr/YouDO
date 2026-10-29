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
import android.graphics.Typeface;
import androidx.core.graphics.ColorUtils;

/**
 * Draws the shapes widgets cannot be built from: Dashboard's task arc or goal
 * gauge between its two dials, and the Room widget's lines. Drawn at 1.5 px per dp, which keeps the bitmaps
 * small enough to send to the launcher while staying smooth.
 */
final class ArcPainter {
    static final int OPEN = 0;
    static final int DONE = 1;
    static final int NOW = 2;
    static final int LATE = 3;
    static final int LATE_NOW = 4;

    private static final float SCALE = 1.5f;
    /** The focus dial's amber. */
    static final int FLAME = 0xFFFFA94D;
    private static final int NEEDLE = 0xFFFF6A3D;
    private static final int FUEL = 0xFF7CC4FF;
    /** Narrower or lower than this, the dials step aside and the arc takes the room. */
    private static final int DIALS_MIN_WIDTH_DP = 290;
    private static final int DIALS_MIN_HEIGHT_DP = 92;
    private static final float DIAL_R = 29;
    /** From each side to a dial's centre. */
    private static final float DIAL_X = 36;
    /** The room each side keeps for its dial, from the edge to the arc. */
    private static final float DIAL_SIDE = 86;

    private ArcPainter() {}

    /** The colours to draw with, for the phone's current light or dark mode. */
    static final class Palette {
        final int accent;
        final int dim;
        final int knob;
        final int late;
        final int live;
        /** The dials' second line of text. */
        final int text2;

        Palette(int accent, int dim, int knob, int late, int live, int text2) {
            this.accent = accent;
            this.dim = dim;
            this.knob = knob;
            this.late = late;
            this.live = live;
            this.text2 = text2;
        }
    }

    /** Whether a box this size shows the two dials beside the arc. */
    static boolean hasDials(int widthDp, int heightDp) {
        return widthDp >= DIALS_MIN_WIDTH_DP && heightDp >= DIALS_MIN_HEIGHT_DP;
    }

    /**
     * The task arc's upper half circle, as {centre x, centre y, radius} in px:
     * as large as the height allows, less the dials' room at the sides.
     */
    private static float[] frame(int w, int h, boolean dials) {
        float cy = h - 9 * SCALE;
        float side = (dials ? DIAL_SIDE : 16) * SCALE;
        float r = Math.min(w / 2f - side, cy - 8 * SCALE);
        return new float[] { w / 2f, cy, Math.max(r, 10 * SCALE) };
    }

    /** The arc's radius in dp at this size, as dayArc and gauge draw it. */
    static float dayArcRadiusDp(int widthDp, int heightDp) {
        return frame(Math.round(widthDp * SCALE), Math.round(heightDp * SCALE), hasDials(widthDp, heightDp))[2] / SCALE;
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

    private static float[] point(float cx, float cy, float radius, float degrees) {
        return point(new float[] { cx, cy }, radius, degrees);
    }

    /** The knob that marks where you are: a disc with a hole the arc shows through. */
    private static void knob(Canvas canvas, float[] at, int color, int centre) {
        canvas.drawCircle(at[0], at[1], 8 * SCALE, fill(color));
        canvas.drawCircle(at[0], at[1], 3.5f * SCALE, fill(centre));
    }

    private static RectF circle(float cx, float cy, float r) {
        return new RectF(cx - r, cy - r, cx + r, cy + r);
    }

    /** Tick marks just inside a dial's rim, from start through sweep, count + 1 of them. */
    private static void ticks(Canvas canvas, float cx, float cy, float r, float start, float sweep, int count, int major,
                              float litTo, int lit, int unlit) {
        for (int i = 0; i <= count; i++) {
            float a = start + sweep * i / count;
            boolean big = i % major == 0;
            float[] from = point(cx, cy, r - 6 * SCALE, a);
            float[] to = point(cx, cy, r - (big ? 11 : 9) * SCALE, a);
            Paint tick = stroke(a <= litTo + 0.01f ? lit : unlit, big ? 1.6f : 1f);
            tick.setStrokeCap(Paint.Cap.BUTT);
            canvas.drawLine(from[0], from[1], to[0], to[1], tick);
        }
    }

    private static void needle(Canvas canvas, float cx, float cy, float r, float at, Palette palette) {
        float[] tip = point(cx, cy, r - 3 * SCALE, at);
        float[] tail = point(cx, cy, 6 * SCALE, at + 180);
        canvas.drawLine(tail[0], tail[1], tip[0], tip[1], stroke(NEEDLE, 2.2f));
        canvas.drawCircle(cx, cy, 4.6f * SCALE, fill(palette.knob));
        canvas.drawCircle(cx, cy, 1.8f * SCALE, fill(palette.dim));
    }

    private static Paint label(int color, float sizeDp) {
        Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
        text.setTextSize(sizeDp * SCALE);
        text.setTextAlign(Paint.Align.CENTER);
        text.setTypeface(Typeface.DEFAULT_BOLD);
        text.setColor(color);
        return text;
    }

    /**
     * The two dials in the upper corners, a little above the top of the arc:
     * on the left today's focus toward the bar (focus, its share; 1 or more
     * once reached), ending at a flame that glows with the dial once the bar
     * is hit; on the right what is left of the day (dayLeft, 1 at 6:00 to 0 at
     * midnight), red in its last two hours. Under each, its reading
     * (readings: focus, its label, the day left, its label), drawn here so it
     * stays centred under its dial however the launcher scales the picture.
     */
    private static void dials(Canvas canvas, float[] f, int w, int h, float focus, float dayLeft, String[] readings, Palette palette) {
        float r = DIAL_R * SCALE;
        float cy = Math.max((DIAL_R + 4) * SCALE, Math.min(f[1] - f[2] + 14 * SCALE, h - 58 * SCALE));
        int tick = ColorUtils.blendARGB(palette.dim, palette.knob, 0.35f);
        float start = 150;
        float sweep = 240;

        // Focus toward the bar.
        float cx = DIAL_X * SCALE;
        boolean hit = focus >= 1;
        float at = start + sweep * Math.max(0f, Math.min(1f, focus));
        canvas.drawArc(circle(cx, cy, r), start, sweep, false, stroke(palette.dim, 3.5f));
        if (focus > 0) {
            if (hit) canvas.drawArc(circle(cx, cy, r), start, at - start, false, glow(stroke(FLAME, 6), 4, 150));
            canvas.drawArc(circle(cx, cy, r), start, at - start, false, stroke(FLAME, 3.5f));
        }
        ticks(canvas, cx, cy, r, start, sweep, 8, 4, at, FLAME, tick);
        float[] tip = point(cx, cy, r + 9 * SCALE, start + sweep);
        if (hit) canvas.drawCircle(tip[0], tip[1], 7 * SCALE, glow(fill(FLAME), 5, 120));
        Paint flame = label(0xFFFFFFFF, hit ? 13 : 11);
        canvas.drawText("🔥", tip[0], tip[1] + (hit ? 4.5f : 4) * SCALE, flame);
        needle(canvas, cx, cy, r, at, palette);

        // What is left of the day.
        cx = (w / SCALE - DIAL_X) * SCALE;
        float left = Math.max(0f, Math.min(1f, dayLeft));
        boolean low = left < 2f / 18;
        at = start + sweep * left;
        canvas.drawArc(circle(cx, cy, r), start, sweep, false, stroke(palette.dim, 3.5f));
        canvas.drawArc(circle(cx, cy, r), start, sweep * 2 / 18, false, stroke(ColorUtils.setAlphaComponent(palette.late, 130), 3.5f));
        if (left > 0) canvas.drawArc(circle(cx, cy, r), start, at - start, false, stroke(low ? palette.late : FUEL, 3.5f));
        ticks(canvas, cx, cy, r, start, sweep, 4, 2, -1, tick, tick);
        float[] empty = point(cx, cy, r + 9 * SCALE, start);
        float[] full = point(cx, cy, r + 9 * SCALE, start + sweep);
        canvas.drawText("E", empty[0], empty[1] + 3.5f * SCALE, label(low ? palette.late : tick, 9));
        canvas.drawText("F", full[0], full[1] + 3.5f * SCALE, label(tick, 9));
        needle(canvas, cx, cy, r, at, palette);

        if (readings == null) return;
        reading(canvas, DIAL_X * SCALE, cy, w, readings[0], readings[1], hit ? FLAME : palette.knob, palette);
        reading(canvas, w - DIAL_X * SCALE, cy, w, readings[2], readings[3], low ? palette.late : palette.knob, palette);
    }

    /** A dial's reading, centred under it, kept inside the picture when it is wide. */
    private static void reading(Canvas canvas, float cx, float cy, int w, String value, String key, int color, Palette palette) {
        Paint top = label(color, 13.5f);
        Paint under = label(palette.text2, 10);
        float half = Math.max(top.measureText(value), under.measureText(key)) / 2 + SCALE;
        float x = Math.max(half, Math.min(w - half, cx));
        float baseline = cy + (DIAL_R + 12) * SCALE;
        canvas.drawText(value, x, baseline, top);
        canvas.drawText(key, x, baseline + 14 * SCALE, under);
    }

    /**
     * Dashboard: one pill per task (OPEN, DONE, NOW, LATE or LATE_NOW) between
     * the two dials (focus and dayLeft, see dials). While focusing, nowFill
     * (0..1) fills the current pill in green as its steps are done; it is below
     * 0 otherwise. The gaps allow for the pills' round ends so they never
     * touch; with too many to fit, the pills turn square.
     */
    static Bitmap dayArc(int widthDp, int heightDp, int[] segments, float nowFill, float focus, float dayLeft,
                         String[] readings, Palette palette) {
        Bitmap bitmap = bitmap(widthDp, heightDp);
        Canvas canvas = new Canvas(bitmap);
        boolean withDials = hasDials(widthDp, heightDp);
        float[] f = frame(bitmap.getWidth(), bitmap.getHeight(), withDials);
        if (withDials) dials(canvas, f, bitmap.getWidth(), bitmap.getHeight(), focus, dayLeft, readings, palette);
        RectF box = new RectF(f[0] - f[2], f[1] - f[2], f[0] + f[2], f[1] + f[2]);
        int n = segments.length;
        if (n == 0) {
            canvas.drawArc(box, 180, 180, false, stroke(palette.dim, 9));
            return bitmap;
        }
        // Half the thickest pill's width, as an angle: the room its round end takes.
        float cap = (float) Math.toDegrees(6.5f * SCALE / f[2]);
        boolean round = n == 1 || (n - 1) * (2 * cap + 5) <= 110;
        float gap = n == 1 ? 0 : round ? 2 * cap + 5 : Math.min(4.5f, 60f / n);
        float inset = round ? cap : 0;
        float per = (180f - (n - 1) * gap) / n;
        float[] marker = null;
        int markerColor = palette.accent;
        for (int i = 0; i < n; i++) {
            float start = 180 + i * (per + gap) + inset;
            float length = Math.max(0.5f, per - 2 * inset);
            int state = segments[i];
            boolean late = state == LATE || state == LATE_NOW;
            boolean now = state == NOW || state == LATE_NOW;
            int color = state == OPEN ? palette.dim : late ? palette.late : palette.accent;
            Paint.Cap ends = round ? Paint.Cap.ROUND : Paint.Cap.BUTT;
            if (state == DONE) {
                Paint halo = glow(stroke(color, 14), 4, 110);
                halo.setStrokeCap(ends);
                canvas.drawArc(box, start, length, false, halo);
            }
            Paint segment = stroke(now ? ColorUtils.setAlphaComponent(color, 90) : late ? ColorUtils.setAlphaComponent(color, 120) : color, now ? 13 : 9);
            segment.setStrokeCap(ends);
            canvas.drawArc(box, start, length, false, segment);
            if (now) {
                float done = nowFill >= 0 ? length * Math.min(1f, nowFill) : 0;
                if (nowFill >= 0 && done > 0) {
                    Paint progress = stroke(palette.live, 13);
                    progress.setStrokeCap(ends);
                    canvas.drawArc(box, start, done, false, progress);
                }
                marker = point(f, f[2], start + done);
                markerColor = nowFill >= 0 ? palette.live : color;
            }
        }
        if (marker != null) knob(canvas, marker, palette.knob, markerColor);
        return bitmap;
    }

    /** The goal gauge: the share of the goal done, along the arc, glowing; the dials beside it. */
    static Bitmap gauge(int widthDp, int heightDp, float pct, float focus, float dayLeft, String[] readings, Palette palette) {
        Bitmap bitmap = bitmap(widthDp, heightDp);
        Canvas canvas = new Canvas(bitmap);
        boolean withDials = hasDials(widthDp, heightDp);
        float[] f = frame(bitmap.getWidth(), bitmap.getHeight(), withDials);
        if (withDials) dials(canvas, f, bitmap.getWidth(), bitmap.getHeight(), focus, dayLeft, readings, palette);
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
