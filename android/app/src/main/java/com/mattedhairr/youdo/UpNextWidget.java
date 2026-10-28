package com.mattedhairr.youdo;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import org.json.JSONObject;

/** Up next (4×2): today's Scheduled or Backlog cards one at a time, or the running session. */
public class UpNextWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] widgetIds) {
        for (int id : widgetIds) HomeWidgets.render(context, manager, UpNextWidget.class, id);
    }

    @Override
    public void onDeleted(Context context, int[] widgetIds) {
        HomeWidgetStore.forget(context, widgetIds);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (intent == null || !HomeWidgets.ACTION_CARD.equals(intent.getAction())) return;
        String action = intent.getStringExtra(HomeWidgets.EXTRA_ACTION);
        int widgetId = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        if (action == null || widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) return;

        if ("next".equals(action) || "prev".equals(action)) {
            HomeWidgets.step(context, widgetId, "next".equals(action));
        } else if (HomeWidgets.TAB_SCHEDULED.equals(action) || HomeWidgets.TAB_BACKLOG.equals(action)) {
            HomeWidgetStore.setPlace(context, widgetId, action, 0);
            HomeWidgets.render(context, AppWidgetManager.getInstance(context), UpNextWidget.class, widgetId);
        } else if ("start".equals(action)) {
            String taskId = intent.getStringExtra(HomeWidgets.EXTRA_TASK);
            JSONObject card = HomeWidgets.findTask(HomeWidgetStore.snapshot(context), taskId);
            // Saving the session redraws Up next as the timer (HomeWidgets.onSessionChanged).
            if (card != null && SessionNotificationStore.startFromWidget(context, taskId, card.optString("title"))) {
                FocusStatusPoster.post(context, SessionNotificationStore.sessionObject(context), goAsync());
            }
        }
    }
}
