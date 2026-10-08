<?php

namespace App\Models;

use App\Database\DatabaseEngines;
use Illuminate\Database\Eloquent\Model;

/**
 * A saved database connection.
 *
 * Named and shaped as Redbrix's model of the same name, over the same table (see the
 * create_organization_connections_table migration), so code written against one reads the
 * other. What Redbrix has here and the board does not: the organization, roles and permission
 * relations, and the organization's "credential storage allowed" policy check.
 */
class OrganizationConnection extends Model
{
    protected $fillable = [
        'organization_id',
        'name',
        'driver',
        'host',
        'port',
        'database',
        'schema',
        'username',
        'ssl',
    ];

    protected $casts = [
        'port' => 'integer',
        'ssl' => 'boolean',
        'policy_version' => 'integer',
        'credential_saved_at' => 'datetime',
        'verified_at' => 'datetime',
    ];

    /**
     * Never expose the ciphertext through serialization, API payloads or logs. The credential
     * fields are set only via the methods below, never mass-assigned.
     */
    protected $hidden = [
        'password_encrypted',
    ];

    /**
     * The schema whose tables this connection shows: the database on MySQL and MariaDB, the chosen
     * schema — `public` if none — on PostgreSQL.
     */
    public function discoverySchema(): string
    {
        return DatabaseEngines::schemaFor(DatabaseEngines::normalize($this->driver), $this->schema)
            ?? (string) $this->database;
    }

    /**
     * Store (or replace) the connection password, encrypted with the dedicated credential key.
     */
    public function storeCredential(string $password, ?User $savedBy = null): void
    {
        $this->password_encrypted = app('credential.encrypter')->encrypt($password);
        $this->credential_saved_by_user_id = $savedBy?->id;
        $this->credential_saved_at = now();
        $this->save();
    }

    /**
     * Remove any stored password.
     */
    public function clearCredential(): void
    {
        $this->password_encrypted = null;
        $this->credential_saved_by_user_id = null;
        $this->credential_saved_at = null;
        $this->save();
    }

    /**
     * Whether these details have ever been proven to work.
     */
    public function isVerified(): bool
    {
        return $this->verified_at !== null;
    }

    /**
     * Record that these details connected successfully just now.
     */
    public function markVerified(): void
    {
        $this->forceFill(['verified_at' => now()])->save();
    }

    /**
     * Whether a password is stored for this connection.
     */
    public function hasStoredCredential(): bool
    {
        return $this->password_encrypted !== null;
    }

    /**
     * Decrypt and return the stored password, or null when none is stored.
     */
    public function credentialPassword(): ?string
    {
        if ($this->password_encrypted === null) {
            return null;
        }

        return app('credential.encrypter')->decrypt($this->password_encrypted);
    }

    /**
     * Everything needed to connect, in the parameter shape TargetConnections takes — the same
     * shape Redbrix keeps a person's live connection in.
     *
     * @return array{driver: string, host: string, port: int, database: string, schema: ?string, username: string, password: string, ssl: bool}
     */
    public function connectionParams(): array
    {
        return [
            'driver' => DatabaseEngines::normalize($this->driver),
            'host' => (string) $this->host,
            'port' => (int) $this->port,
            'database' => (string) $this->database,
            'schema' => $this->schema,
            'username' => (string) $this->username,
            'password' => (string) ($this->credentialPassword() ?? ''),
            'ssl' => (bool) $this->ssl,
        ];
    }
}
