package com.mattedhairr.youdo;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;
import org.json.JSONObject;

/** Up next (4×2): today's open cards one at a time, or the running session. */
public class UpNextWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] widgetIds) {
        for (int id : widgetIds) HomeWidgets.render(context, manager, UpNextWidget.class, id);
        HomeWidgets.notifyCards(manager, widgetIds);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (intent == null || !HomeWidgets.ACTION_CARD.equals(intent.getAction())) return;
        String action = intent.getStringExtra(HomeWidgets.EXTRA_ACTION);
        String taskId = intent.getStringExtra(HomeWidgets.EXTRA_TASK);
        if (action == null || taskId == null) return;

        if ("up".equals(action) || "down".equals(action)) {
            if (!HomeWidgetStore.moveFromWidget(context, taskId, "up".equals(action))) return;
            AppWidgetManager manager = AppWidgetManager.getInstance(context);
            HomeWidgets.refresh(context, UpNextWidget.class);
            // Keep the moved card in front, at its new place in the stack.
            int widgetId = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
            int index = HomeWidgetStore.indexOfTask(HomeWidgetStore.snapshot(context), taskId);
            if (widgetId != AppWidgetManager.INVALID_APPWIDGET_ID && index >= 0) {
                RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_up_next);
                views.setDisplayedChild(R.id.widget_stack, index);
                manager.partiallyUpdateAppWidget(widgetId, views);
            }
        } else if ("start".equals(action)) {
            JSONObject card = HomeWidgetStore.find(HomeWidgetStore.snapshot(context), "today", taskId);
            // Saving the session redraws Up next as the timer (HomeWidgets.onSessionChanged).
            if (card != null && SessionNotificationStore.startFromWidget(context, taskId, card.optString("title"))) {
                FocusStatusPoster.post(context, SessionNotificationStore.sessionObject(context), goAsync());
            }
        }
    }
}
