package com.mattedhairr.youdo;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import org.json.JSONObject;

/**
 * Day Arc (4×3): the day as one arc with today's Scheduled and Backlog tasks
 * and the goal view, or the running session. (Up next before; the name stays
 * so widgets already placed turn into it.)
 */
public class UpNextWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] widgetIds) {
        // Also runs every 30 minutes, which moves the sun along the arc.
        for (int id : widgetIds) HomeWidgets.render(context, manager, UpNextWidget.class, id);
    }

    /** Resized: the arc is redrawn to the new size. */
    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int widgetId, Bundle options) {
        HomeWidgets.render(context, manager, UpNextWidget.class, widgetId);
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
        String id = intent.getStringExtra(HomeWidgets.EXTRA_TASK);
        int widgetId = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        if (action == null || widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) return;

        if ("next".equals(action) || "prev".equals(action)) {
            HomeWidgets.step(context, widgetId, "next".equals(action));
        } else if (HomeWidgets.TAB_SCHEDULED.equals(action) || HomeWidgets.TAB_BACKLOG.equals(action)) {
            HomeWidgetStore.setPlace(context, widgetId, action, 0);
            HomeWidgets.render(context, AppWidgetManager.getInstance(context), UpNextWidget.class, widgetId);
        } else if (HomeWidgets.TAB_GOAL.equals(action)) {
            HomeWidgets.showGoal(context, widgetId, id);
        } else if ("start".equals(action)) {
            JSONObject card = HomeWidgets.findTask(HomeWidgetStore.snapshot(context), id);
            // Saving the session redraws Day Arc as the timer (HomeWidgets.onSessionChanged).
            if (card != null && SessionNotificationStore.startFromWidget(context, id, card.optString("title"))) {
                FocusStatusPoster.post(context, SessionNotificationStore.sessionObject(context), goAsync());
            }
        }
    }
}
