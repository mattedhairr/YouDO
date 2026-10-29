package com.mattedhairr.youdo;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProviderInfo;
import android.content.Intent;
import android.os.Bundle;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import org.json.JSONArray;
import org.json.JSONObject;

/** Picks the room a Room widget shows; also on reconfigure. */
public class WidgetConfigActivity extends AppCompatActivity {
    private int widgetId = AppWidgetManager.INVALID_APPWIDGET_ID;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setResult(RESULT_CANCELED);
        Bundle extras = getIntent() != null ? getIntent().getExtras() : null;
        if (extras != null) widgetId = extras.getInt(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        AppWidgetProviderInfo info = widgetId == AppWidgetManager.INVALID_APPWIDGET_ID ? null
            : AppWidgetManager.getInstance(this).getAppWidgetInfo(widgetId);
        if (info == null || !getPackageName().equals(info.provider.getPackageName())) {
            finish();
            return;
        }
        JSONObject snapshot = HomeWidgetStore.snapshot(this);
        JSONArray items = snapshot == null ? null : snapshot.optJSONArray("rooms");

        if (items == null || items.length() == 0) {
            // Still add the widget; it says what to do and opens this picker when tapped.
            new AlertDialog.Builder(this)
                .setTitle("No rooms yet")
                .setMessage("Open YouDO while signed in so it can load your rooms, then tap the widget to choose one.")
                .setPositiveButton("Open YouDO", (dialog, which) -> {
                    done();
                    startActivity(new Intent(this, YouDoActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                })
                .setNegativeButton("Later", (dialog, which) -> done())
                .setOnCancelListener(dialog -> done())
                .show();
            return;
        }

        String[] names = new String[items.length()];
        String[] ids = new String[items.length()];
        for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.optJSONObject(i);
            names[i] = item == null ? "" : item.optString("name");
            ids[i] = item == null ? "" : item.optString("id");
        }
        boolean reconfiguring = HomeWidgetStore.choice(this, widgetId) != null;
        new AlertDialog.Builder(this)
            .setTitle("Choose a room")
            .setItems(names, (dialog, which) -> {
                HomeWidgetStore.setChoice(this, widgetId, ids[which]);
                done();
            })
            .setOnCancelListener(dialog -> {
                if (reconfiguring) done();
                else finish();
            })
            .show();
    }

    private void done() {
        AppWidgetManager manager = AppWidgetManager.getInstance(this);
        HomeWidgets.render(this, manager, RoomWidget.class, widgetId);
        setResult(RESULT_OK, new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId));
        finish();
    }
}
