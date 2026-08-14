package com.testhistory.sample;

import static androidx.test.espresso.Espresso.onView;
import static androidx.test.espresso.action.ViewActions.click;
import static androidx.test.espresso.action.ViewActions.replaceText;
import static androidx.test.espresso.assertion.ViewAssertions.matches;
import static androidx.test.espresso.matcher.ViewMatchers.isDisplayed;
import static androidx.test.espresso.matcher.ViewMatchers.withId;
import static androidx.test.espresso.matcher.ViewMatchers.withText;

import androidx.lifecycle.Lifecycle;
import androidx.test.core.app.ActivityScenario;

import com.testhistory.sample.evidence.AllureEvidence;

final class SampleAppSteps {
    private SampleAppSteps() {
    }

    static ActivityScenario<MainActivity> openApplication() throws Exception {
        final ActivityScenario<MainActivity>[] scenario = new ActivityScenario[1];
        AllureEvidence.step("Open application", () -> {
            scenario[0] = ActivityScenario.launch(MainActivity.class);
            scenario[0].moveToState(Lifecycle.State.RESUMED);
        });
        return scenario[0];
    }

    static void checkStartScreen() throws Exception {
        AllureEvidence.step("Check start screen title", () ->
                onView(withId(R.id.title_text)).check(matches(withText("TestHistory Android Sample"))));
        AllureEvidence.step("Check username input", () ->
                onView(withId(R.id.username_input)).check(matches(isDisplayed())));
        AllureEvidence.step("Check login button", () ->
                onView(withId(R.id.login_button)).check(matches(isDisplayed())));
    }

    static void checkCheckoutControls() throws Exception {
        AllureEvidence.step("Check checkout button", () ->
                onView(withId(R.id.checkout_button)).check(matches(isDisplayed())));
        AllureEvidence.step("Check initial cart counter", () ->
                onView(withId(R.id.cart_count_text)).check(matches(withText("Cart: 0"))));
    }

    static void typeUsername(String username) throws Exception {
        AllureEvidence.step("Type username " + username, () ->
                onView(withId(R.id.username_input)).perform(replaceText(username)));
    }

    static void submitLogin() throws Exception {
        AllureEvidence.step("Submit login form", () ->
                onView(withId(R.id.login_button)).perform(click()));
    }

    static void checkWelcome(String username) throws Exception {
        AllureEvidence.step("Check welcome message", () ->
                onView(withId(R.id.status_text)).check(matches(withText("Welcome, " + username))));
    }

    static void checkValidationError() throws Exception {
        AllureEvidence.step("Check validation error text", () ->
                onView(withId(R.id.status_text)).check(matches(withText("Validation error: username is required"))));
    }

    static void checkWaitingStatus() throws Exception {
        AllureEvidence.step("Check initial waiting status", () ->
                onView(withId(R.id.status_text)).check(matches(withText("Waiting for login"))));
    }

    static void addCheckoutItems(int count) throws Exception {
        for (int index = 1; index <= count; index += 1) {
            final int itemNumber = index;
            AllureEvidence.step("Add checkout item " + itemNumber, () ->
                    onView(withId(R.id.checkout_button)).perform(click()));
        }
    }

    static void checkCartCount(int count) throws Exception {
        AllureEvidence.step("Check cart counter " + count, () ->
                onView(withId(R.id.cart_count_text)).check(matches(withText("Cart: " + count))));
    }

    static void captureEvidence(String name) throws Exception {
        AllureEvidence.step("Capture evidence: " + name, () -> AllureEvidence.screenshot(name));
    }
}
