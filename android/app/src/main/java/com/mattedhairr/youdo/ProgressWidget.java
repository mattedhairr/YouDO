package com.mattedhairr.youdo;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

/** Progress (4×1): streak, one chosen goal's progress, and the days left when it has a deadline. */
public class ProgressWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] widgetIds) {
        for (int id : widgetIds) HomeWidgets.render(context, manager, ProgressWidget.class, id);
    }

    @Override
    public void onDeleted(Context context, int[] widgetIds) {
        HomeWidgetStore.forget(context, widgetIds);
    }
}
