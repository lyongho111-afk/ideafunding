(() => {
  const data = JSON.parse(document.getElementById("review-data").textContent);
  const status = document.getElementById("review-status");
  let privateKey = window.IdeaCrypto.getPrivateKey(data.username);

  const fileInput = document.getElementById("private-key-file");
  fileInput.addEventListener("change", async () => {
    try {
      const bundle = JSON.parse(await fileInput.files[0].text());
      if (bundle.username !== data.username || !bundle.privateKey) {
        throw new Error("관리자 계정과 개인키 파일이 일치하지 않습니다.");
      }
      privateKey = bundle.privateKey;
      window.IdeaCrypto.savePrivateKey(data.username, privateKey);
      status.textContent = "관리자 개인키를 불러왔습니다.";
    } catch (error) {
      status.textContent = error.message;
    }
  });

  document.querySelectorAll(".preview-button").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!privateKey) {
        status.textContent = "먼저 관리자 개인키 파일을 불러와 주세요.";
        return;
      }
      button.disabled = true;
      try {
        const idea = data.ideas.find((item) => item.id === Number(button.dataset.ideaId));
        const preview = await window.IdeaCrypto.decrypt(idea.preview, idea.wrappedKey, privateKey);
        const panel = button.closest(".panel");
        panel.querySelector(`#preview-${idea.id}`).textContent = preview;
        panel.querySelector(`#preview-${idea.id}`).hidden = false;
        panel.querySelector('[name="previewViewed"]').value = "true";
        panel.querySelector(".approve-button").disabled = false;
        status.textContent = "미리보기 확인 완료. 이 아이디어를 승인할 수 있습니다.";
      } catch (error) {
        status.textContent = `미리보기를 복호화할 수 없습니다: ${error.message}`;
        button.disabled = false;
      }
    });
  });
})();
