(() => {
  const data = JSON.parse(document.getElementById("idea-crypto-data").textContent);
  const setStatus = (message) => {
    const status = document.getElementById("disclosure-status");
    if (status) status.textContent = message;
  };
  const loadPrivateKey = async () => {
    const privateKey = window.IdeaCrypto.getPrivateKey(data.username);
    if (!privateKey) throw new Error("개인키를 먼저 불러와 주세요.");
    return privateKey;
  };

  const fileInput = document.getElementById("private-key-file");
  if (fileInput) {
    fileInput.addEventListener("change", async () => {
      try {
        const bundle = JSON.parse(await fileInput.files[0].text());
        if (bundle.username !== data.username || !bundle.privateKey) throw new Error("현재 로그인 계정과 개인키 파일이 일치하지 않습니다.");
        window.IdeaCrypto.savePrivateKey(data.username, bundle.privateKey);
        fileInput.parentElement.firstChild.textContent = "개인키 파일을 불러왔습니다.";
      } catch (error) {
        setStatus(error.message);
        alert(error.message);
      }
    });
  }

  const ownButton = document.getElementById("decrypt-own");
  if (ownButton) ownButton.addEventListener("click", async () => {
    const output = document.getElementById("own-details");
    try {
      output.textContent = await window.IdeaCrypto.decrypt(data.encryptedDetails, data.wrappedKey, await loadPrivateKey());
      output.hidden = false;
    } catch (error) {
      alert(`상세 내용을 열 수 없습니다: ${error.message}`);
    }
  });

  const sharedButton = document.getElementById("decrypt-shared");
  if (sharedButton) sharedButton.addEventListener("click", async () => {
    const output = document.getElementById("shared-details");
    try {
      output.textContent = await window.IdeaCrypto.decrypt(
        data.disclosure.encrypted_details, data.disclosure.wrapped_key, await loadPrivateKey()
      );
      output.hidden = false;
    } catch (error) {
      alert(`공개된 내용을 열 수 없습니다: ${error.message}`);
    }
  });

  document.querySelectorAll(".disclose-button").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const plaintext = await window.IdeaCrypto.decrypt(
          data.encryptedDetails, data.wrappedKey, await loadPrivateKey()
        );
        const backerPublicKey = JSON.parse(decodeURIComponent(button.dataset.publicKey));
        const encrypted = await window.IdeaCrypto.encrypt(plaintext, backerPublicKey);
        const response = await fetch(`/ideas/${data.ideaId}/disclosures/${button.dataset.backerId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(encrypted),
        });
        if (!response.ok) throw new Error(await response.text());
        setStatus("해당 예약자에게 상세 내용을 암호화해 공개했습니다.");
        button.textContent = "공개 완료";
      } catch (error) {
        setStatus(`공개 실패: ${error.message}`);
        button.disabled = false;
      }
    });
  });
})();
