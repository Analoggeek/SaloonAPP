package com.maisonnoir.booking;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.WindowInsets;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

/** Opens the hosted salon in a browser tab rather than handling checkout or payment data itself. */
public final class BookingActivity extends Activity {
    private static final int NIGHT = Color.rgb(22, 21, 18);
    private static final int GOLD = Color.rgb(200, 169, 106);
    private static final int CREAM = Color.rgb(248, 241, 230);

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(NIGHT);
        getWindow().setStatusBarColor(NIGHT);
        getWindow().setNavigationBarColor(NIGHT);

        LinearLayout content = new LinearLayout(this);
        content.setGravity(Gravity.CENTER);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(25), dp(24), dp(25), dp(24));
        content.setOnApplyWindowInsetsListener((view, insets) -> {
            if (android.os.Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets safe = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                view.setPadding(dp(25) + safe.left, dp(24) + safe.top, dp(25) + safe.right, dp(24) + safe.bottom);
            }
            return insets;
        });
        scroll.addView(content);

        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.icon);
        content.addView(logo, new LinearLayout.LayoutParams(dp(76), dp(76)));
        TextView brand = text("MAISON NOIR · SALON & GROOMING", 11, GOLD);
        brand.setLetterSpacing(.17f);
        add(content, brand, 23);
        TextView headline = text("Look Good.\nFeel Great.", 42, CREAM);
        headline.setTypeface(Typeface.create("serif", Typeface.NORMAL));
        add(content, headline, 9);
        add(content, text("Book an appointment, choose an available time, and track your visit.", 16, CREAM), 17);

        Button book = new Button(this);
        book.setText("Open booking website");
        book.setTextColor(NIGHT);
        book.setAllCaps(false);
        book.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        book.setPadding(dp(17), dp(11), dp(17), dp(11));
        GradientDrawable fill = new GradientDrawable();
        fill.setColor(GOLD);
        fill.setCornerRadius(dp(7));
        book.setBackground(fill);
        book.setOnClickListener(view -> openBooking());
        add(content, book, 25);
        setContentView(scroll);
    }

    private void openBooking() {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(BookingConfig.URL));
        intent.addCategory(Intent.CATEGORY_BROWSABLE);
        Bundle browser = new Bundle();
        // Browser Custom Tabs protocol; falls back to normal browser navigation.
        browser.putBinder("android.support.customtabs.extra.SESSION", null);
        intent.putExtras(browser);
        try {
            startActivity(intent);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "Install or enable a web browser to continue.", Toast.LENGTH_LONG).show();
        }
    }

    private TextView text(String value, int size, int color) {
        TextView view = new TextView(this);
        view.setGravity(Gravity.CENTER);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(color);
        return view;
    }

    private void add(LinearLayout parent, android.view.View child, int margin) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        params.topMargin = dp(margin);
        parent.addView(child, params);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
