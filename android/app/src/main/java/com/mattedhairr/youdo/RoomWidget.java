package com.mattedhairr.youdo;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;

/** Room (4×2): one chosen room, its members around it, lit up for whoever is focusing. */
public class RoomWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] widgetIds) {
        // Also runs every 30 minutes, which puts out dots older than four hours.
        for (int id : widgetIds) HomeWidgets.render(context, manager, RoomWidget.class, id);
    }

    /** Resized: the lines are redrawn to the new size. */
    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int widgetId, Bundle options) {
        HomeWidgets.render(context, manager, RoomWidget.class, widgetId);
    }

    @Override
    public void onDeleted(Context context, int[] widgetIds) {
        HomeWidgetStore.forget(context, widgetIds);
    }
}
