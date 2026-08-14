package com.testhistory.sample;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;

import com.testhistory.sample.evidence.AllureEvidenceRule;

import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public final class StateRegressionTest {
    @Rule
    public final AllureEvidenceRule evidence = new AllureEvidenceRule("Android state regression", "Platform QA", "regression")
            .label("feature", "state")
            .label("JIRA_ISSUE", "ANDROID-127")
            .parameter("screen", "Main");

    @Test
    public void freshActivityStartsWithWaitingStatus() throws Exception {
        try (ActivityScenario<MainActivity> ignored = SampleAppSteps.openApplication()) {
            SampleAppSteps.checkWaitingStatus();
            SampleAppSteps.checkCartCount(0);
            SampleAppSteps.captureEvidence("fresh activity state");
        }
    }

    @Test
    public void secondActivityStartsWithEmptyCart() throws Exception {
        try (ActivityScenario<MainActivity> ignored = SampleAppSteps.openApplication()) {
            SampleAppSteps.addCheckoutItems(2);
            SampleAppSteps.checkCartCount(2);
        }
        try (ActivityScenario<MainActivity> ignored = SampleAppSteps.openApplication()) {
            SampleAppSteps.checkCartCount(0);
            SampleAppSteps.captureEvidence("second activity empty cart");
        }
    }

    @Test
    public void repeatedLoginKeepsLatestUsername() throws Exception {
        try (ActivityScenario<MainActivity> ignored = SampleAppSteps.openApplication()) {
            SampleAppSteps.typeUsername("first.user");
            SampleAppSteps.submitLogin();
            SampleAppSteps.checkWelcome("first.user");
            SampleAppSteps.typeUsername("second.user");
            SampleAppSteps.submitLogin();
            SampleAppSteps.checkWelcome("second.user");
            SampleAppSteps.captureEvidence("latest username wins");
        }
    }

    @Test
    public void checkoutAndLoginCanBeInterleaved() throws Exception {
        try (ActivityScenario<MainActivity> ignored = SampleAppSteps.openApplication()) {
            SampleAppSteps.addCheckoutItems(1);
            SampleAppSteps.typeUsername("interleaved");
            SampleAppSteps.submitLogin();
            SampleAppSteps.addCheckoutItems(2);
            SampleAppSteps.checkWelcome("interleaved");
            SampleAppSteps.checkCartCount(3);
            SampleAppSteps.captureEvidence("interleaved state");
        }
    }

    @Test
    public void startScreenControlsRemainVisibleAfterInteractions() throws Exception {
        try (ActivityScenario<MainActivity> ignored = SampleAppSteps.openApplication()) {
            SampleAppSteps.addCheckoutItems(1);
            SampleAppSteps.typeUsername("visible.controls");
            SampleAppSteps.submitLogin();
            SampleAppSteps.checkStartScreen();
            SampleAppSteps.checkCartCount(1);
            SampleAppSteps.captureEvidence("controls remain visible");
        }
    }
}
