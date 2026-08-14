package com.testhistory.sample;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.util.Log;
import android.view.Gravity;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

public final class MainActivity extends Activity {
    private int cartCount = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Log.i("TH_SAMPLE", "MainActivity created");

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setPadding(40, 72, 40, 40);
        root.setBackgroundColor(Color.rgb(240, 245, 252));

        TextView title = new TextView(this);
        title.setId(R.id.title_text);
        title.setText("TestHistory Android Sample");
        title.setTextSize(26f);
        title.setTextColor(Color.rgb(10, 30, 60));
        title.setGravity(Gravity.CENTER);

        EditText username = new EditText(this);
        username.setId(R.id.username_input);
        username.setHint("Username");
        username.setSingleLine(true);
        username.setTextColor(Color.rgb(10, 30, 60));
        username.setHintTextColor(Color.rgb(92, 112, 138));

        Button login = new Button(this);
        login.setId(R.id.login_button);
        login.setText("Login");
        login.setAllCaps(false);
        login.setTextSize(16f);

        Button checkout = new Button(this);
        checkout.setId(R.id.checkout_button);
        checkout.setText("Add checkout item");
        checkout.setAllCaps(false);
        checkout.setTextSize(16f);

        TextView status = new TextView(this);
        status.setId(R.id.status_text);
        status.setText("Waiting for login");
        status.setTextSize(20f);
        status.setTextColor(Color.rgb(20, 95, 70));
        status.setGravity(Gravity.CENTER);

        TextView cart = new TextView(this);
        cart.setId(R.id.cart_count_text);
        cart.setText("Cart: 0");
        cart.setTextSize(22f);
        cart.setTextColor(Color.rgb(35, 70, 125));
        cart.setGravity(Gravity.CENTER);

        login.setOnClickListener(view -> {
            String value = username.getText().toString().trim();
            if (value.isEmpty()) {
                status.setText("Validation error: username is required");
                Log.w("TH_SAMPLE", "Login validation failed");
                return;
            }
            status.setText("Welcome, " + value);
            Log.i("TH_SAMPLE", "Login completed for " + value);
        });

        checkout.setOnClickListener(view -> {
            cartCount += 1;
            cart.setText("Cart: " + cartCount);
            Log.i("TH_SAMPLE", "Checkout item added: " + cartCount);
        });

        root.addView(title, matchWidth());
        root.addView(username, matchWidth());
        root.addView(login, matchWidth());
        root.addView(checkout, matchWidth());
        root.addView(status, matchWidth());
        root.addView(cart, matchWidth());
        setContentView(root);
    }

    private static LinearLayout.LayoutParams matchWidth() {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        params.setMargins(0, 10, 0, 10);
        return params;
    }
}
