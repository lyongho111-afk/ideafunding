const postForm = document.getElementById("daily-post-form");
const imageInput = document.getElementById("post-images");
const previews = document.getElementById("image-previews");
const statusMessage = document.getElementById("post-status");
const submitButton = postForm.querySelector("button[type=submit]");
const maxImages = 4;
const maxSourceBytes = 10 * 1024 * 1024;
const maxCompressedBytes = 700 * 1024;

const readAsDataUrl = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(new Error("사진을 읽지 못했습니다."));
  reader.readAsDataURL(blob);
});

const compressImage = async (file) => {
  if (!file.type.startsWith("image/") || file.size > maxSourceBytes) {
    throw new Error("사진은 장당 10MB 이하의 이미지 파일만 올릴 수 있습니다.");
  }
  const bitmap = await createImageBitmap(file);
  let scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
  let quality = 0.82;
  let blob;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    if (!blob) {
      bitmap.close();
      throw new Error("사진을 압축하지 못했습니다.");
    }
    if (blob.size <= maxCompressedBytes) break;
    if (quality > 0.55) quality -= 0.1;
    else {
      scale *= 0.8;
      quality = 0.75;
    }
  }
  bitmap.close();
  if (!blob || blob.size > maxCompressedBytes) throw new Error("사진 용량을 줄이지 못했습니다. 더 작은 사진을 선택해 주세요.");
  return readAsDataUrl(blob);
};

imageInput.addEventListener("change", () => {
  previews.replaceChildren();
  statusMessage.textContent = "";
  if (imageInput.files.length > maxImages) {
    imageInput.value = "";
    statusMessage.textContent = "사진은 한 게시물에 최대 4장까지 선택할 수 있습니다.";
    return;
  }
  Array.from(imageInput.files).forEach((file) => {
    const preview = document.createElement("div");
    preview.className = "image-preview";
    preview.textContent = file.name;
    previews.appendChild(preview);
  });
});

postForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const content = postForm.elements.content.value.trim();
  const files = Array.from(imageInput.files);
  if (!content && !files.length) {
    statusMessage.textContent = "글을 입력하거나 사진을 한 장 이상 선택해 주세요.";
    return;
  }
  if (content.length > 500 || files.length > maxImages) {
    statusMessage.textContent = "글은 500자 이내, 사진은 최대 4장까지 등록할 수 있습니다.";
    return;
  }
  submitButton.disabled = true;
  statusMessage.textContent = files.length ? "사진을 최적화하고 있습니다..." : "일상을 등록하고 있습니다...";
  try {
    const images = await Promise.all(files.map(compressImage));
    statusMessage.textContent = "일상을 등록하고 있습니다...";
    const response = await fetch(postForm.action, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, images }),
    });
    if (!response.ok) throw new Error(await response.text());
    window.location.reload();
  } catch (error) {
    statusMessage.textContent = error.message;
    submitButton.disabled = false;
  }
});
