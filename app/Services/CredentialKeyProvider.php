<?php

namespace App\Services;

use RuntimeException;

/**
 * Resolves the dedicated key used to encrypt stored database passwords.
 *
 * As in Redbrix, this key is deliberately separate from APP_KEY: APP_KEY protects cookies and
 * sessions and may be rotated for reasons of its own, which should never make saved database
 * passwords unreadable. Redbrix fetches it from AWS in production; the board only needs
 * CREDENTIAL_KEY in .env.
 *
 * Passwords encrypted under one key can only be read with the same key. Moving saved
 * connections into Redbrix therefore means either using Redbrix's key here, or decrypting and
 * re-encrypting each password as the rows are copied.
 */
class CredentialKeyProvider
{
    private ?string $resolved = null;

    public function resolve(): string
    {
        if ($this->resolved !== null) {
            return $this->resolved;
        }

        $key = config('services.credential.key');
        if (!is_string($key) || $key === '') {
            throw new RuntimeException('No credential key configured: set CREDENTIAL_KEY in .env.');
        }

        return $this->resolved = $this->normalize($key);
    }

    /**
     * Accept both Laravel's "base64:"-prefixed keys and raw 32-byte keys, returning raw bytes.
     */
    private function normalize(string $key): string
    {
        return str_starts_with($key, 'base64:')
            ? (string) base64_decode(substr($key, 7), true)
            : $key;
    }
}
