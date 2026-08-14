package com.testhistory.sample;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;

import com.testhistory.sample.evidence.AllureEvidenceRule;

import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public final class LoginFlowTest {
    @Rule
    public final AllureEvidenceRule evidence = new AllureEvidenceRule("Android login", "Mobile QA", "smoke", "regression")
            .label("feature", "login")
            .label("JIRA_ISSUE", "ANDROID-123")
            .parameter("screen", "Login");

    @Test
    public void smokeScreenIsDisplayed() throws Exception {
        try (ActivityScenario<MainActivity> ignored = SampleAppSteps.openApplication()) {
            SampleAppSteps.checkStartScreen();
            SampleAppSteps.checkWaitingStatus();
            SampleAppSteps.captureEvidence("login smoke screen");
        }
    }

    @Test
    public void userCanLogin() throws Exception {
        try (ActivityScenario<MainActivity> ignored = SampleAppSteps.openApplication()) {
            SampleAppSteps.typeUsername("qa.lead");
            SampleAppSteps.submitLogin();
            SampleAppSteps.checkWelcome("qa.lead");
            SampleAppSteps.captureEvidence("qa lead logged in");
        }
    }

    @Test
    public void analystCanLogin() throws Exception {
        try (ActivityScenario<MainActivity> ignored = SampleAppSteps.openApplication()) {
            SampleAppSteps.typeUsername("analyst");
            SampleAppSteps.submitLogin();
            SampleAppSteps.checkWelcome("analyst");
            SampleAppSteps.captureEvidence("analyst logged in");
        }
    }

    @Test
    public void usernameCanBeReplacedBeforeSubmit() throws Exception {
        try (ActivityScenario<MainActivity> ignored = SampleAppSteps.openApplication()) {
            SampleAppSteps.typeUsername("draft.user");
            SampleAppSteps.typeUsername("release.owner");
            SampleAppSteps.submitLogin();
            SampleAppSteps.checkWelcome("release.owner");
            SampleAppSteps.captureEvidence("replaced username login");
        }
    }

    @Test
    public void loginDoesNotChangeCartCounter() throws Exception {
        try (ActivityScenario<MainActivity> ignored = SampleAppSteps.openApplication()) {
            SampleAppSteps.typeUsername("cart.viewer");
            SampleAppSteps.submitLogin();
            SampleAppSteps.checkWelcome("cart.viewer");
            SampleAppSteps.checkCartCount(0);
            SampleAppSteps.captureEvidence("login keeps empty cart");
        }
    }

    @Test
    public void loginFormCanBeSubmittedAfterCheckoutAction() throws Exception {
        try (ActivityScenario<MainActivity> ignored = SampleAppSteps.openApplication()) {
            SampleAppSteps.addCheckoutItems(1);
            SampleAppSteps.typeUsername("late.login");
            SampleAppSteps.submitLogin();
            SampleAppSteps.checkWelcome("late.login");
            SampleAppSteps.checkCartCount(1);
            SampleAppSteps.captureEvidence("late login after checkout");
        }
    }
}
