/**
 * IIT KGP ERP Auto-Login - Cryptography Utility
 * Uses Web Crypto API: PBKDF2 (100,000 rounds of SHA-256) + AES-GCM (256-bit).
 * Keeps credentials securely encrypted at rest in local browser storage.
 */

const ERP_CRYPTO = {
  /**
   * Converts an ArrayBuffer to a hexadecimal string.
   */
  bufToHex(buffer) {
    return Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  },

  /**
   * Converts a hexadecimal string back to a Uint8Array.
   */
  hexToBuf(hexString) {
    const bytes = new Uint8Array(Math.ceil(hexString.length / 2));
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hexString.substr(i * 2, 2), 16);
    }
    return bytes;
  },

  /**
   * Derives a 256-bit AES-GCM key from a 4-digit PIN and a cryptographic salt.
   */
  async deriveKey(pin, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(String(pin)),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  },

  /**
   * Encrypts a plain JavaScript object with the user's PIN.
   * Returns an object containing { salt, iv, ciphertext } in hex.
   */
  async encrypt(dataObj, pin) {
    const enc = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await this.deriveKey(pin, salt);

    const plaintext = enc.encode(JSON.stringify(dataObj));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      plaintext
    );

    return {
      salt: this.bufToHex(salt),
      iv: this.bufToHex(iv),
      ciphertext: this.bufToHex(ciphertext),
      version: 1,
      updatedAt: new Date().toISOString()
    };
  },

  /**
   * Decrypts { salt, iv, ciphertext } with the user's PIN.
   * Throws an error if the PIN is incorrect (AES-GCM authentication tag check fails).
   */
  async decrypt(encryptedPayload, pin) {
    if (!encryptedPayload || !encryptedPayload.salt || !encryptedPayload.iv || !encryptedPayload.ciphertext) {
      throw new Error('Invalid encrypted payload structure');
    }

    const dec = new TextDecoder();
    const salt = this.hexToBuf(encryptedPayload.salt);
    const iv = this.hexToBuf(encryptedPayload.iv);
    const ciphertext = this.hexToBuf(encryptedPayload.ciphertext);

    const key = await this.deriveKey(pin, salt);

    try {
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        ciphertext
      );
      return JSON.parse(dec.decode(decrypted));
    } catch (err) {
      throw new Error('Incorrect PIN. Authentication failed.');
    }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ERP_CRYPTO;
}
