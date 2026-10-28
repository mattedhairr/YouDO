package com.mattedhairr.youdo;

import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;
import org.json.JSONArray;
import org.json.JSONObject;

/** The cards in Up next's stack before Android 12 (later versions get them inline, HomeWidgets.upNext). */
public class UpNextWidgetService extends RemoteViewsService {
    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new Cards(getApplicationContext());
    }

    private static final class Cards implements RemoteViewsFactory {
        private final Context ctx;
        private JSONArray cards = new JSONArray();
        private int[] accent = HomeWidgets.accent(null);

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
            accent = HomeWidgets.accent(snapshot);
        }

        @Override
        public void onDestroy() {}

        @Override
        public int getCount() {
            return cards.length();
        }

        @Override
        public RemoteViews getViewAt(int position) {
            return HomeWidgets.card(ctx, cards, position, accent);
        }

        @Override
        public RemoteViews getLoadingView() {
            // A blank card rather than Android's "Loading…" text.
            return new RemoteViews(ctx.getPackageName(), R.layout.widget_up_next_card);
        }

        @Override
        public int getViewTypeCount() {
            return 1;
        }

        @Override
        public long getItemId(int position) {
            return HomeWidgets.cardId(cards.optJSONObject(position));
        }

        @Override
        public boolean hasStableIds() {
            return true;
        }
    }
}
