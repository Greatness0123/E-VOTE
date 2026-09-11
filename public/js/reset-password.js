const resetParams = new URLSearchParams(window.location.search);

document.getElementById("reset-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const errorEl = document.getElementById("error");
  errorEl.textContent = "";
  try {
    await api("/auth/password/reset", {
      method: "POST",
      body: {
        matricNumber: resetParams.get("matric"),
        token: resetParams.get("token"),
        newPassword: document.getElementById("password").value,
      },
    });
    document.getElementById("msg").textContent = "Password updated. You can now log in.";
    document.getElementById("reset-form").style.display = "none";
  } catch (err) {
    errorEl.textContent = err.message;
  }
});
