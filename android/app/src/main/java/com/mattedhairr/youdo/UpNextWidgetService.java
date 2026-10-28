package com.mattedhairr.youdo;

import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;
import org.json.JSONArray;
import org.json.JSONObject;

/** The cards in Up next's stack. */
public class UpNextWidgetService extends RemoteViewsService {
    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new Cards(getApplicationContext());
    }

    private static final class Cards implements RemoteViewsFactory {
        private final Context ctx;
        private JSONArray cards = new JSONArray();

        Cards(Context ctx) {
            this.ctx = ctx;
        }

        @Override
        public void onCreate() {}

        @Override
        public void onDataSetChanged() {
            JSONObject snapshot = HomeWidgetStore.snapshot(ctx);
            JSONArray today = snapshot == null ? null : snapshot.optJSONArray("today");
            cards = today != null ? today : new JSONArray();
        }

        @Override
        public void onDestroy() {}

        @Override
        public int getCount() {
            return cards.length();
        }

        @Override
        public RemoteViews getViewAt(int position) {
            RemoteViews views = new RemoteViews(ctx.getPackageName(), R.layout.widget_up_next_card);
            JSONObject card = cards.optJSONObject(position);
            if (card == null) return views;
            String id = card.optString("id");
            int done = card.optInt("done");
            int total = card.optInt("total");
            views.setTextViewText(R.id.card_title, card.optString("title"));
            views.setTextViewText(R.id.card_path, card.optString("path"));
            views.setTextViewText(R.id.card_rank, "#" + card.optInt("rank"));
            views.setTextViewText(R.id.card_steps, total > 0 ? done + " of " + total + " steps" : "No steps");
            views.setProgressBar(R.id.card_bar, 100, total > 0 ? Math.min(100, done * 100 / total) : 0, false);
            views.setViewVisibility(R.id.card_up, position == 0 ? View.INVISIBLE : View.VISIBLE);
            views.setViewVisibility(R.id.card_down, position == cards.length() - 1 ? View.INVISIBLE : View.VISIBLE);
            views.setOnClickFillInIntent(R.id.card_up, tap("up", id));
            views.setOnClickFillInIntent(R.id.card_down, tap("down", id));
            views.setOnClickFillInIntent(R.id.card_start, tap("start", id));
            return views;
        }

        private static Intent tap(String action, String taskId) {
            return new Intent().putExtra(HomeWidgets.EXTRA_ACTION, action).putExtra(HomeWidgets.EXTRA_TASK, taskId);
        }

        @Override
        public RemoteViews getLoadingView() {
            return null;
        }

        @Override
        public int getViewTypeCount() {
            return 1;
        }

        @Override
        public long getItemId(int position) {
            return position;
        }

        @Override
        public boolean hasStableIds() {
            return false;
        }
    }
}
