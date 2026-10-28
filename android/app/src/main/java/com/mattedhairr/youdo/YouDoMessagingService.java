package com.mattedhairr.youdo;

import androidx.annotation.NonNull;
import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;

/**
 * Capacitor's push service, plus the silent room updates that keep the Room
 * widget's live dots current while YouDO is closed (hub_widget_push.sql).
 */
public class YouDoMessagingService extends MessagingService {
    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        if ("focus_status".equals(message.getData().get("type"))) {
            if (HomeWidgetStore.applyFocusStatus(this, message.getData())) HomeWidgets.refresh(this, RoomWidget.class);
            return;
        }
        super.onMessageReceived(message);
    }
}
