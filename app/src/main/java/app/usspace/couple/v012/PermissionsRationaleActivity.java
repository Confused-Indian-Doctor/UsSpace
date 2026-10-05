package app.usspace.couple.v012;

import android.app.Activity;
import android.os.Bundle;
import android.graphics.Color;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

public class PermissionsRationaleActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        int pad = (int) (24 * getResources().getDisplayMetrics().density);

        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(pad, pad, pad, pad);
        box.setBackgroundColor(Color.rgb(255, 248, 247));

        TextView title = new TextView(this);
        title.setText("UsSpace Health privacy");
        title.setTextSize(26);
        title.setTextColor(Color.rgb(45, 37, 40));
        title.setPadding(0, 0, 0, pad / 2);
        box.addView(title, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        TextView body = new TextView(this);
        body.setText(
                "UsSpace reads selected wellness data from Health Connect so you can see your own Samsung Health summary inside the app.\n\n" +
                "Requested read-only data: steps, sleep, resting heart rate, active calories, blood oxygen (SpO₂), weight and exercise sessions.\n\n" +
                "Health data stays on this phone. It is excluded from UsSpace's Firebase/Firestore sync payloads and is not shared with your partner by default. Cycle data is also kept out of cloud sync.\n\n" +
                "UsSpace does not write health records back to Health Connect. You can revoke any Health Connect permission at any time in Android Settings."
        );
        body.setTextSize(16);
        body.setLineSpacing(0, 1.25f);
        body.setTextColor(Color.rgb(84, 69, 74));
        box.addView(body, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        ScrollView scroll = new ScrollView(this);
        scroll.addView(box);
        setContentView(scroll);
    }
}
