package com.testhistory.sample;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;

import com.testhistory.sample.evidence.AllureEvidenceRule;

import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public final class CheckoutFlowTest {
    @Rule
    public final AllureEvidenceRule evidence = new AllureEvidenceRule("Android checkout", "Checkout", "smoke", "regression")
            .label("feature", "checkout")
            .label("JIRA_ISSUE", "ANDROID-125")
            .parameter("gateway", "sandbox");

    @Test
    public void checkoutCounterStartsFromZero() throws Exception {
        try (ActivityScenario<MainActivity> ignored = SampleAppSteps.openApplication()) {
            SampleAppSteps.checkCheckoutControls();
            SampleAppSteps.captureEvidence("checkout controls");
        }
    }

    @Test
    public void checkoutCounterIncrementsOnce() throws Exception {
        try (ActivityScenario<MainActivity> ignored = SampleAppSteps.openApplication()) {
            SampleAppSteps.addCheckoutItems(1);
            SampleAppSteps.checkCartCount(1);
            SampleAppSteps.captureEvidence("checkout one item");
        }
    }

    @Test
    public void checkoutCounterIncrementsTwice() throws Exception {
        try (ActivityScenario<MainActivity> ignored = SampleAppSteps.openApplication()) {
            SampleAppSteps.addCheckoutItems(2);
            SampleAppSteps.checkCartCount(2);
            SampleAppSteps.captureEvidence("checkout two items");
        }
    }

    @Test
    public void checkoutCounterIncrementsFiveTimes() throws Exception {
        try (ActivityScenario<MainActivity> ignored = SampleAppSteps.openApplication()) {
            SampleAppSteps.addCheckoutItems(5);
            SampleAppSteps.checkCartCount(5);
            SampleAppSteps.captureEvidence("checkout five items");
        }
    }

    @Test
    public void checkoutCounterSurvivesSuccessfulLogin() throws Exception {
        try (ActivityScenario<MainActivity> ignored = SampleAppSteps.openApplication()) {
            SampleAppSteps.addCheckoutItems(3);
            SampleAppSteps.typeUsername("buyer");
            SampleAppSteps.submitLogin();
            SampleAppSteps.checkWelcome("buyer");
            SampleAppSteps.checkCartCount(3);
            SampleAppSteps.captureEvidence("checkout after buyer login");
        }
    }

    @Test
    public void checkoutCanContinueAfterSuccessfulLogin() throws Exception {
        try (ActivityScenario<MainActivity> ignored = SampleAppSteps.openApplication()) {
            SampleAppSteps.typeUsername("checkout.after.login");
            SampleAppSteps.submitLogin();
            SampleAppSteps.addCheckoutItems(4);
            SampleAppSteps.checkCartCount(4);
            SampleAppSteps.captureEvidence("checkout continues after login");
        }
    }
}
