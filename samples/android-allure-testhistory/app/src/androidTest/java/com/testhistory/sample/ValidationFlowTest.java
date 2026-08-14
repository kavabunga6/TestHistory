package com.testhistory.sample;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;

import com.testhistory.sample.evidence.AllureEvidenceRule;

import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public final class ValidationFlowTest {
    @Rule
    public final AllureEvidenceRule evidence = new AllureEvidenceRule("Android validation", "Mobile QA", "negative")
            .label("feature", "login")
            .label("JIRA_ISSUE", "ANDROID-124")
            .parameter("input", "username validation");

    @Test
    public void emptyLoginShowsValidationError() throws Exception {
        try (ActivityScenario<MainActivity> ignored = SampleAppSteps.openApplication()) {
            SampleAppSteps.submitLogin();
            SampleAppSteps.checkValidationError();
            SampleAppSteps.captureEvidence("empty login validation");
        }
    }

    @Test
    public void spacesOnlyLoginShowsValidationError() throws Exception {
        try (ActivityScenario<MainActivity> ignored = SampleAppSteps.openApplication()) {
            SampleAppSteps.typeUsername("   ");
            SampleAppSteps.submitLogin();
            SampleAppSteps.checkValidationError();
            SampleAppSteps.captureEvidence("spaces login validation");
        }
    }

    @Test
    public void validationCanRecoverAfterUserInput() throws Exception {
        try (ActivityScenario<MainActivity> ignored = SampleAppSteps.openApplication()) {
            SampleAppSteps.submitLogin();
            SampleAppSteps.checkValidationError();
            SampleAppSteps.typeUsername("recovered.user");
            SampleAppSteps.submitLogin();
            SampleAppSteps.checkWelcome("recovered.user");
            SampleAppSteps.captureEvidence("validation recovery");
        }
    }

    @Test
    public void validationDoesNotResetCartCounter() throws Exception {
        try (ActivityScenario<MainActivity> ignored = SampleAppSteps.openApplication()) {
            SampleAppSteps.addCheckoutItems(2);
            SampleAppSteps.submitLogin();
            SampleAppSteps.checkValidationError();
            SampleAppSteps.checkCartCount(2);
            SampleAppSteps.captureEvidence("validation keeps cart");
        }
    }

    @Test
    public void clearedUsernameShowsValidationErrorAgain() throws Exception {
        try (ActivityScenario<MainActivity> ignored = SampleAppSteps.openApplication()) {
            SampleAppSteps.typeUsername("temporary");
            SampleAppSteps.typeUsername("");
            SampleAppSteps.submitLogin();
            SampleAppSteps.checkValidationError();
            SampleAppSteps.captureEvidence("cleared username validation");
        }
    }
}
