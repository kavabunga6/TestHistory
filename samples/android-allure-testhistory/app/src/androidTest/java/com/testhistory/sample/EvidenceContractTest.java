package com.testhistory.sample;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;

import com.testhistory.sample.evidence.AllureEvidence;
import com.testhistory.sample.evidence.AllureEvidenceRule;

import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public final class EvidenceContractTest {
    @Rule
    public final AllureEvidenceRule evidence = new AllureEvidenceRule("Android evidence", "Platform QA", "evidence")
            .label("feature", "attachments")
            .label("JIRA_ISSUE", "ANDROID-126")
            .parameter("evidence", "screenshot video logcat");

    @Test
    public void evidenceArtifactsAreCollectedForPassingTest() throws Exception {
        try (ActivityScenario<MainActivity> ignored = SampleAppSteps.openApplication()) {
            SampleAppSteps.checkStartScreen();
            SampleAppSteps.captureEvidence("evidence contract screen");
        }
    }

    @Test
    public void nestedStepsAreWrittenToAllureResult() throws Exception {
        try (ActivityScenario<MainActivity> ignored = SampleAppSteps.openApplication()) {
            AllureEvidence.step("Выполнить составной сценарий", () -> {
                SampleAppSteps.typeUsername("nested.steps");
                SampleAppSteps.submitLogin();
                SampleAppSteps.checkWelcome("nested.steps");
                SampleAppSteps.captureEvidence("nested steps final screen");
            });
        }
    }

    @Test
    public void logcatContainsUserActions() throws Exception {
        try (ActivityScenario<MainActivity> ignored = SampleAppSteps.openApplication()) {
            SampleAppSteps.typeUsername("logcat.user");
            SampleAppSteps.submitLogin();
            SampleAppSteps.addCheckoutItems(1);
            SampleAppSteps.checkCartCount(1);
            SampleAppSteps.captureEvidence("logcat user actions");
        }
    }
}
