// Real client-side liveness detection. Runs entirely in the browser via
// self-hosted face-api.js models (public/models/) — no video frame or
// image is ever sent to the server. Only the outcome (which challenge was
// completed) is reported back with the server-issued challenge and nonce.
//
// This is an additional authentication factor layered on top of password
// + OTP, not a sole security mechanism, and browser landmark detection is
// not equivalent to enterprise-grade anti-spoofing — it defends against
// an absent/static face, not a determined attacker with e.g. a video replay.

const CHALLENGE_TYPES = ["blink", "turn_left", "turn_right", "smile"];
const DETECTION_OPTIONS = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });
const CHALLENGE_TIMEOUT_MS = 15000;
const EAR_BLINK_THRESHOLD = 0.24; // eye-aspect-ratio below this = eyes closed
const MOUTH_SMILE_RATIO = 0.42; // mouth-width/face-width above this = smiling
const YAW_TURN_THRESHOLD = 0.18; // normalized nose-offset-from-center

let modelsLoaded = false;

async function loadModels() {
  if (modelsLoaded) return;
  await faceapi.nets.tinyFaceDetector.loadFromUri("/models");
  await faceapi.nets.faceLandmark68TinyNet.loadFromUri("/models");
  await faceapi.nets.faceRecognitionNet.loadFromUri("/models");
  modelsLoaded = true;
}

function eyeAspectRatio(eyePoints) {
  // Standard 6-point EAR formula.
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const vertical1 = dist(eyePoints[1], eyePoints[5]);
  const vertical2 = dist(eyePoints[2], eyePoints[4]);
  const horizontal = dist(eyePoints[0], eyePoints[3]);
  return (vertical1 + vertical2) / (2 * horizontal);
}

function analyzeFrame(landmarks, faceBox) {
  const leftEye = landmarks.getLeftEye();
  const rightEye = landmarks.getRightEye();
  const mouth = landmarks.getMouth();
  const nose = landmarks.getNose();

  const ear = (eyeAspectRatio(leftEye) + eyeAspectRatio(rightEye)) / 2;
  const mouthWidth = Math.hypot(mouth[6].x - mouth[0].x, mouth[6].y - mouth[0].y);
  const smileRatio = mouthWidth / faceBox.width;
  const noseTipX = nose[3].x;
  const faceCenterX = faceBox.x + faceBox.width / 2;
  const yaw = (noseTipX - faceCenterX) / faceBox.width;

  return { ear, smileRatio, yaw };
}

/**
 * Runs a single randomized liveness challenge against the given <video>
 * element. Resolves { completed: true, challenge } on success, or
 * { completed: false, reason } on timeout/no-face.
 */
async function runLivenessChallenge(videoEl, onInstruction, requiredChallenge) {
  await loadModels();

  const challenge = requiredChallenge || CHALLENGE_TYPES[Math.floor(Math.random() * CHALLENGE_TYPES.length)];
  if (!CHALLENGE_TYPES.includes(challenge)) throw new Error("Unsupported liveness challenge");
  const instructions = {
    blink: "Blink both eyes",
    turn_left: "Turn your head left",
    turn_right: "Turn your head right",
    smile: "Smile",
  };
  onInstruction(instructions[challenge]);

  let baselineYaw = null;
  let sawNoFaceFrames = 0;
  const start = Date.now();

  return new Promise((resolve) => {
    const interval = setInterval(async () => {
      if (Date.now() - start > CHALLENGE_TIMEOUT_MS) {
        clearInterval(interval);
        resolve({ completed: false, reason: "TIMEOUT" });
        return;
      }

      const detection = await faceapi
        .detectSingleFace(videoEl, DETECTION_OPTIONS)
        .withFaceLandmarks(true)
        .withFaceDescriptor();

      if (!detection) {
        sawNoFaceFrames += 1;
        if (sawNoFaceFrames > 20) {
          clearInterval(interval);
          resolve({ completed: false, reason: "NO_FACE_DETECTED" });
        }
        return;
      }
      sawNoFaceFrames = 0;

      const { ear, smileRatio, yaw } = analyzeFrame(detection.landmarks, detection.detection.box);
      if (baselineYaw === null) baselineYaw = yaw;

      let satisfied = false;
      if (challenge === "blink" && ear < EAR_BLINK_THRESHOLD) satisfied = true;
      if (challenge === "smile" && smileRatio > MOUTH_SMILE_RATIO) satisfied = true;
      if (challenge === "turn_left" && yaw - baselineYaw > YAW_TURN_THRESHOLD) satisfied = true;
      if (challenge === "turn_right" && baselineYaw - yaw > YAW_TURN_THRESHOLD) satisfied = true;

      if (satisfied) {
        clearInterval(interval);
        resolve({ completed: true, challenge, descriptor: Array.from(detection.descriptor) });
      }
    }, 150);
  });
}

window.livenessDetection = { runLivenessChallenge, loadModels };
