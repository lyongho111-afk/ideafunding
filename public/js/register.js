document.getElementById("register-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const status = document.getElementById("key-status");
  const username = form.elements.username.value.trim();
  try {
    status.textContent = "암호화 키를 생성하는 중입니다...";
    const pair = await window.IdeaCrypto.createKeyPair();
    const publicKey = await window.IdeaCrypto.exportKey(pair.publicKey);
    const privateKey = await window.IdeaCrypto.exportKey(pair.privateKey);
    document.getElementById("public-key").value = JSON.stringify(publicKey);
    const response = await fetch(form.action, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        password: form.elements.password.value,
        password2: form.elements.password2.value,
        publicKey: JSON.stringify(publicKey),
      }),
    });
    if (!response.ok) throw new Error(await response.text());
    window.IdeaCrypto.savePrivateKey(username, privateKey);
    const file = new Blob([JSON.stringify({ username, privateKey }, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(file);
    link.download = `idea-vault-key-${username}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    window.location.href = "/login";
  } catch (error) {
    status.textContent = `키 생성에 실패했습니다: ${error.message}`;
  }
});
