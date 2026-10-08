<?php

namespace App\Http\Controllers;

use App\Database\DatabaseEngines;
use App\Models\OrganizationConnection;
use App\Services\ConnectionVerifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * The database connection the board reads from: view it, test details, save, remove.
 *
 * Responses use Redbrix's envelope, { status, data, message }. The password is write-only: it
 * is never sent back, only whether one is stored.
 */
class ConnectionController extends Controller
{
    public function __construct(private ConnectionVerifier $verifier)
    {
    }

    public function show(): JsonResponse
    {
        $connection = $this->current();

        return response()->json([
            'status' => 200,
            'data' => $connection ? $this->present($connection) : null,
            'engines' => collect(DatabaseEngines::enabled())
                ->map(fn ($label, $engine) => [
                    'value' => $engine,
                    'label' => $label,
                    'port' => DatabaseEngines::defaultPort($engine),
                ])
                ->values(),
            'message' => '',
        ]);
    }

    /**
     * Check details without saving them. A blank password means "use the stored one".
     */
    public function test(Request $request): JsonResponse
    {
        $details = $this->validated($request);
        $password = $this->passwordFor($details, $this->current());

        if ($password === null) {
            return $this->refuse('Enter the password to test with. It will not be saved.');
        }

        if ($failure = $this->verify($details, $password)) {
            return $this->refuse($failure);
        }

        return response()->json([
            'status' => 200,
            'data' => null,
            'message' => 'Connected to ' . ($details['name'] ?: $details['database']) . ' successfully.',
        ]);
    }

    /**
     * Save the connection, but only once it is proven to work, as Redbrix does when a shared
     * connection is added. A blank password keeps the stored one.
     */
    public function save(Request $request): JsonResponse
    {
        $details = $this->validated($request);
        $existing = $this->current();
        $password = $this->passwordFor($details, $existing);

        if ($password === null) {
            return $this->refuse('Enter the password for this connection.');
        }

        if ($failure = $this->verify($details, $password)) {
            return $this->refuse($failure);
        }

        $connection = $existing ?? new OrganizationConnection();
        $connection->fill([
            'name' => $details['name'] ?: null,
            'driver' => $details['driver'],
            'host' => $details['host'],
            'port' => $details['port'],
            'database' => $details['database'],
            'schema' => DatabaseEngines::schemaFor($details['driver'], $details['schema'] ?? null),
            'username' => $details['username'],
            'ssl' => $details['ssl'],
        ])->save();

        if (($details['password'] ?? '') !== '') {
            $connection->storeCredential($details['password']);
        }
        $connection->markVerified();

        return response()->json([
            'status' => 200,
            'data' => $this->present($connection->refresh()),
            'message' => 'Connection saved.',
        ]);
    }

    public function destroy(): JsonResponse
    {
        $this->current()?->delete();

        return response()->json(['status' => 200, 'data' => null, 'message' => 'Connection removed.']);
    }

    private function current(): ?OrganizationConnection
    {
        return OrganizationConnection::query()->oldest('id')->first();
    }

    private function validated(Request $request): array
    {
        $details = $request->validate([
            'name' => ['nullable', 'string', 'max:255'],
            'driver' => ['required', Rule::in(array_keys(DatabaseEngines::enabled()))],
            'host' => ['required', 'string', 'max:255'],
            'port' => ['required', 'integer', 'between:1,65535'],
            'database' => ['required', 'string', 'max:255'],
            'schema' => ['nullable', 'string', 'max:63'],
            'username' => ['required', 'string', 'max:255'],
            'password' => ['nullable', 'string'],
            'ssl' => ['boolean'],
        ], [
            'driver.in' => 'Choose one of the database types listed.',
        ]);

        $details['name'] = trim((string) ($details['name'] ?? ''));
        $details['ssl'] = (bool) ($details['ssl'] ?? false);

        return $details;
    }

    /**
     * The password typed, or the stored one when none was typed — but only while the details
     * still point at the same place. A stored password is never offered to a different server
     * or user, or anyone could read it back by pointing the form at a server they control.
     */
    private function passwordFor(array $details, ?OrganizationConnection $existing): ?string
    {
        if (($details['password'] ?? '') !== '') {
            return $details['password'];
        }

        if (!$existing?->hasStoredCredential()) {
            return null;
        }

        $sameTarget = $existing->host === $details['host']
            && (int) $existing->port === (int) $details['port']
            && $existing->username === $details['username'];

        return $sameTarget ? $existing->credentialPassword() : null;
    }

    /**
     * Null when the details connect; otherwise what to tell the person.
     */
    private function verify(array $details, string $password): ?string
    {
        $failure = $this->verifier->verify($details, $password, $details['ssl']);

        if ($failure === null) {
            return null;
        }

        if ($failure === ConnectionVerifier::FAILURE_TLS_UNAVAILABLE) {
            return 'Could not connect with SSL/TLS — this server may not support it. Turn SSL/TLS off, or enable TLS on the database server.';
        }

        return match ($this->verifier->lastFailureDetail()) {
            'access_denied' => 'The server refused that username and password.',
            'unknown_database' => "The server has no database called \"{$details['database']}\".",
            'unreachable' => "Could not reach {$details['host']} on port {$details['port']}. Check the host and port, and that the server accepts connections from this machine.",
            default => 'Could not connect. Check the host, port, database name, username and password.',
        };
    }

    private function refuse(string $message): JsonResponse
    {
        return response()->json(['status' => 422, 'data' => null, 'message' => $message], 422);
    }

    private function present(OrganizationConnection $connection): array
    {
        return [
            'id' => $connection->id,
            'name' => $connection->name,
            'driver' => DatabaseEngines::normalize($connection->driver),
            'host' => $connection->host,
            'port' => $connection->port,
            'database' => $connection->database,
            'schema' => $connection->schema,
            'username' => $connection->username,
            'ssl' => $connection->ssl,
            'hasStoredPassword' => $connection->hasStoredCredential(),
            'verifiedAt' => $connection->verified_at?->toIso8601String(),
        ];
    }
}
