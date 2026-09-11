let enrollmentModelsLoaded = false;

async function loadEnrollmentModels() {
  if (enrollmentModelsLoaded) return;
  await faceapi.nets.tinyFaceDetector.loadFromUri("/models");
  await faceapi.nets.faceLandmark68TinyNet.loadFromUri("/models");
  await faceapi.nets.faceRecognitionNet.loadFromUri("/models");
  enrollmentModelsLoaded = true;
}

document.getElementById("face-enrollment-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = document.getElementById("face-enrollment-msg");
  const file = document.getElementById("face-enrollment-image").files[0];
  message.textContent = "Preparing enrollment…";
  try {
    await loadEnrollmentModels();
    const image = await faceapi.bufferToImage(await file.arrayBuffer().then((bytes) => new Blob([bytes])));
    const detection = await faceapi.detectSingleFace(image, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
      .withFaceLandmarks(true)
      .withFaceDescriptor();
    if (!detection) throw new Error("No clear face found in the image");
    const student = await api(`/admin/voters/by-matric/${encodeURIComponent(document.getElementById("face-voter-matric").value.trim())}`);
    await api(`/admin/voters/${student.student.id}/face-enrollment`, {
      method: "POST",
      body: { consent: document.getElementById("face-enrollment-consent").checked, embedding: Array.from(detection.descriptor) },
    });
    event.target.reset();
    message.textContent = "Face enrolled successfully. The source image was not uploaded.";
  } catch (error) {
    message.textContent = error.message;
  }
});

document.getElementById("delete-face-enrollment").addEventListener("click", async () => {
  const message = document.getElementById("face-enrollment-msg");
  message.textContent = "Removing enrollment…";
  try {
    const matricNumber = document.getElementById("face-voter-matric").value.trim();
    const student = await api(`/admin/voters/by-matric/${encodeURIComponent(matricNumber)}`);
    await api(`/admin/voters/${student.student.id}/face-enrollment`, { method: "DELETE" });
    message.textContent = "Face enrollment removed.";
  } catch (error) {
    message.textContent = error.message;
  }
});