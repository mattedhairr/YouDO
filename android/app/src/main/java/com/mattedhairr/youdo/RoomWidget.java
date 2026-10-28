package com.mattedhairr.youdo;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

/** Room (4×1): one chosen room's members, with a live dot and timer on whoever is focusing. */
public class RoomWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] widgetIds) {
        // Also runs every 30 minutes, which puts out dots older than four hours.
        for (int id : widgetIds) HomeWidgets.render(context, manager, RoomWidget.class, id);
    }

    @Override
    public void onDeleted(Context context, int[] widgetIds) {
        HomeWidgetStore.forget(context, widgetIds);
    }
}
