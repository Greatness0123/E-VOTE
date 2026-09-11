document.getElementById("forgot-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = document.getElementById("msg");
  try {
    const result = await api("/auth/password/forgot", {
      method: "POST",
      body: { matricNumber: document.getElementById("matric").value.trim() },
    });
    message.textContent = result.message;
  } catch (err) {
    message.textContent = err.message;
  }
});
