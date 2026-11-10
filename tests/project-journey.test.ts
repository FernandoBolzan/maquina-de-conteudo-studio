import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getProjectJourney, type ProjectJourneyInput } from '../src/renderer/project-journey.js';

const imageInput = (overrides: Partial<ProjectJourneyInput> = {}): ProjectJourneyInput => ({
  kind: 'image', hasBrief: false, hasScript: false, hasRender: false, outputs: [], ...overrides,
});
const videoInput = (overrides: Partial<ProjectJourneyInput> = {}): ProjectJourneyInput => ({
  kind: 'video', hasBrief: false, hasScript: false, hasRender: false, outputs: [], ...overrides,
});
const voice = { selected: true, ready: true, needsKey: false };

test('PostNow advances from a saved brief through review and only offers export after approvals', () => {
  const empty = getProjectJourney(imageInput());
  assert.deepEqual(empty.steps.map(step => step.id), ['brief', 'texts', 'images', 'review', 'export']);
  assert.equal(empty.nextStep.id, 'brief');

  const readyForTexts = getProjectJourney(imageInput({ hasBrief: true }));
  assert.equal(readyForTexts.nextStep.id, 'texts');

  const readyForImages = getProjectJourney(imageInput({ hasBrief: true, textsApproved: true }));
  assert.equal(readyForImages.nextStep.id, 'images');

  const waitingReview = getProjectJourney(imageInput({ hasBrief: true, textsApproved: true, outputs: [{ approved: false }, { approved: true }] }));
  assert.equal(waitingReview.nextStep.id, 'review');
  assert.equal(waitingReview.outputsReady, 1);

  const readyToExport = getProjectJourney(imageInput({ hasBrief: true, textsApproved: true, outputs: [{ approved: true }, { approved: true }] }));
  assert.equal(readyToExport.nextStep.id, 'export');
  assert.equal(readyToExport.nextStep.status, 'current');
});

test('VideoGo voice step is done when unused and waits for a selected voice to be ready', () => {
  const silentPath = getProjectJourney(videoInput({ hasBrief: true, hasScript: true }));
  assert.equal(silentPath.nextStep.id, 'render');
  assert.equal(silentPath.steps.find(step => step.id === 'voice')?.status, 'done');

  const keyMissing = getProjectJourney(videoInput({ hasBrief: true, hasScript: true, voice: { selected: true, ready: false, needsKey: true } }));
  assert.equal(keyMissing.nextStep.id, 'voice');
  assert.equal(keyMissing.nextStep.status, 'blocked');
  assert.equal(keyMissing.steps.find(step => step.id === 'render')?.status, 'upcoming');

  const voiceNotReady = getProjectJourney(videoInput({ hasBrief: true, hasScript: true, voice: { selected: true, ready: false, needsKey: false } }));
  assert.equal(voiceNotReady.nextStep.id, 'voice');
  assert.equal(voiceNotReady.nextStep.status, 'current');

  const readyToRender = getProjectJourney(videoInput({ hasBrief: true, hasScript: true, voice }));
  assert.equal(readyToRender.nextStep.id, 'render');

  const derivedVideo = getProjectJourney(videoInput({
    hasBrief: true,
    hasScript: true,
    outputs: [{ approved: false }],
  }));
  assert.equal(derivedVideo.nextStep.id, 'render');
  assert.equal(derivedVideo.steps.find(step => step.id === 'render')?.status, 'current');

  const review = getProjectJourney(videoInput({ hasBrief: true, hasScript: true, hasRender: true, outputs: [{ approved: false }] }));
  assert.equal(review.nextStep.id, 'review');
  const exportReady = getProjectJourney(videoInput({ hasBrief: true, hasScript: true, hasRender: true, outputs: [{ approved: true }] }));
  assert.equal(exportReady.nextStep.id, 'export');
});

test('an active project job marks the real next stage as in progress', () => {
  const journey = getProjectJourney(imageInput({ hasBrief: true, isRunning: true }));
  assert.equal(journey.nextStep.id, 'texts');
  assert.equal(journey.nextStep.status, 'running');
});
