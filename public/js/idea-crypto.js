(() => {
  const toBase64 = (bytes) => {
    const values = new Uint8Array(bytes);
    let binary = "";
    for (let offset = 0; offset < values.length; offset += 0x8000) {
      binary += String.fromCharCode(...values.subarray(offset, offset + 0x8000));
    }
    return btoa(binary);
  };
  const fromBase64 = (text) => Uint8Array.from(atob(text), (character) => character.charCodeAt(0));
  const importPublicKey = (jwk) => crypto.subtle.importKey(
    "jwk", jwk, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]
  );
  const importPrivateKey = (jwk) => crypto.subtle.importKey(
    "jwk", jwk, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["decrypt"]
  );

  window.IdeaCrypto = {
    async createKeyPair() {
      return crypto.subtle.generateKey({
        name: "RSA-OAEP",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      }, true, ["encrypt", "decrypt"]);
    },
    async exportKey(key) {
      return crypto.subtle.exportKey("jwk", key);
    },
    async encrypt(text, publicJwk) {
      const aesKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, new TextEncoder().encode(text));
      const rawAesKey = await crypto.subtle.exportKey("raw", aesKey);
      const wrapped = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, await importPublicKey(publicJwk), rawAesKey);
      return {
        encryptedDetails: JSON.stringify({ iv: toBase64(iv), ciphertext: toBase64(ciphertext) }),
        wrappedKey: toBase64(wrapped),
      };
    },
    async decrypt(encryptedDetails, wrappedKey, privateJwk) {
      const encrypted = JSON.parse(encryptedDetails);
      const rawAesKey = await crypto.subtle.decrypt(
        { name: "RSA-OAEP" }, await importPrivateKey(privateJwk), fromBase64(wrappedKey)
      );
      const aesKey = await crypto.subtle.importKey("raw", rawAesKey, "AES-GCM", false, ["decrypt"]);
      const plaintext = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: fromBase64(encrypted.iv) }, aesKey, fromBase64(encrypted.ciphertext)
      );
      return new TextDecoder().decode(plaintext);
    },
    getPrivateKey(username) {
      const serialized = localStorage.getItem(`idea-private:${username}`);
      return serialized ? JSON.parse(serialized) : null;
    },
    savePrivateKey(username, jwk) {
      localStorage.setItem(`idea-private:${username}`, JSON.stringify(jwk));
    },
  };
})();
